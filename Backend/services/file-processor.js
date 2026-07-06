const axios = require("axios");
const http = require("http");
const fs = require("fs");
const { queryWithRetry, sleep } = require("../utils/db-retry");
const jobBudget = require("./job-manager");
const { getPoolByService } = require("../config/subscriber-connection");
const db = require("../config/connection");
const ExcelJS = require("exceljs");
const { sendMail } = require("../services/mailer");

// Larger batches mean fewer "stall" gaps between batches (see file-processor
// notes) and fewer DB round-trips, at the cost of reprocessing more records
// if a crash happens mid-batch. 1000 is a reasonable balance for sub-150ms
// API latency; drop it back toward 300 if your latency is higher/jitterier.
const BATCH_SIZE = Number(process.env.PROCESS_BATCH_SIZE) || 1200;
const HTTP_TIMEOUT_MS = Number(process.env.BALANCE_API_TIMEOUT_MS) || 8000;
const HTTP_MAX_RETRIES = 3;
const BALANCE_API_BASE =
  process.env.BALANCE_API_BASE || "http://192.168.15.156:8091";

// Reuse TCP connections across calls instead of a new handshake per request —
// matters a lot once concurrency goes above ~30-50.
const httpClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 200 }),
  timeout: HTTP_TIMEOUT_MS,
});

async function createResponseTable(tableName) {
  console.log(`📦 Creating table: ${tableName}`);
  await queryWithRetry(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      msisdn VARCHAR(20),
      data JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log(`✅ Table ready: ${tableName}`);
}

async function fetchBalance(msisdn) {
  const url = `${BALANCE_API_BASE}/balanceQuery/${msisdn}/P`;
  let lastErr;

  for (let attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    try {
      const start = Date.now();
      const response = await httpClient.get(url);
      console.log(`✅ ${msisdn} → ${Date.now() - start} ms`);
      return response.data;
    } catch (err) {
      lastErr = err;
      const retryable =
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ECONNABORTED" ||
        (err.response && err.response.status >= 500);

      if (!retryable || attempt === HTTP_MAX_RETRIES) break;
      await sleep(300 * attempt);
    }
  }
  throw lastErr;
}

async function processBatch(batch, tableName, semaphore) {
  let successCount = 0;
  let failCount = 0;
  const results = [];
  const failures = [];
  await Promise.all(
    batch.map((msisdn) =>
      semaphore.run(async () => {
        try {
          const data = await fetchBalance(msisdn);
          results.push({ msisdn, data });
          successCount++;
        } catch (err) {
          failCount++;
          failures.push({ msisdn, error: err.message });
          console.error(`❌ Failed for ${msisdn}: ${err.message}`);
        }
      }),
    ),
  );

  if (results.length > 0) {
    const values = results.map((r) => [r.msisdn, JSON.stringify(r.data)]);
    await queryWithRetry(
      `INSERT INTO \`${tableName}\` (msisdn, data) VALUES ?`,
      [values],
    );
  }

  console.log(
    `📊 Batch result → ✅ ${successCount} success, ❌ ${failCount} failed`,
  );
  if (failures.length > 0) {
    console.log(
      `🔍 Failed MSISDNs this batch:`,
      failures.map((f) => f.msisdn),
    );
  }
  return { successCount, failCount };
}

/**
 * Checkpointed line reader. Reads raw bytes (not decoded text) so the
 * byte offset we report back is exact and safe to resume from later —
 * decoding utf8 in a stream can split multi-byte chars across chunks,
 * which makes byte accounting unreliable.
 */
async function processFile(job) {
  console.log(`\n🚀 Starting job ID: ${job.id}`);
  console.log(`📁 File: ${job.file_path || job.file_name}`);

  const filePath = job.file_path || job.file_name;
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const startOffset = Number(job.last_offset) || 0;
  let tableName = job.response_table_name;

  if (!tableName) {
    tableName = `ResponseData_${job.id}_${Date.now()}`;
    await createResponseTable(tableName);
    await queryWithRetry(
      `UPDATE file_entity SET response_table_name = ? WHERE id = ?`,
      [tableName, job.id],
    );
  } else {
    // table already exists from a previous (interrupted) run
    await createResponseTable(tableName);
  }

  console.log(`📍 Resuming from byte offset: ${startOffset}`);

  // Claim a slice of the shared concurrency budget for this job. If another
  // job is/becomes active at the same time, both get automatically and live
  // rebalanced to split the total budget between them.
  const semaphore = jobBudget.register(job.id);

  const stream = fs.createReadStream(filePath, { start: startOffset });

  let leftover = Buffer.alloc(0);
  let filePos = startOffset;
  let batch = [];
  let batchEndPos = filePos;
  let totalProcessed = Number(job.processed_record) || 0;
  let batchCount = 0;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    batchCount++;
    console.log(`📦 Processing batch #${batchCount} (${batch.length} records)`);

    await processBatch(batch, tableName, semaphore);
    totalProcessed += batch.length;

    // Checkpoint AFTER successful batch processing — this is what makes
    // a crash mid-job safe: on restart we resume from batchEndPos, never
    // reprocessing what's already in the response table.
    await queryWithRetry(
      `UPDATE file_entity
       SET last_offset = ?, processed_record = ?, status = 'PROCESSING', job_start_date = COALESCE(job_start_date, NOW())
       WHERE id = ?`,
      [batchEndPos, totalProcessed, job.id],
    );

    console.log(
      `✅ Batch #${batchCount} done. Checkpoint @ byte ${batchEndPos}`,
    );
    batch = [];
  };

  const handleLine = (lineBuf, byteLenIncludingNewline) => {
    filePos += byteLenIncludingNewline;
    const line = lineBuf.toString("utf8").trim();
    if (!line) return;

    const parts = line.split("|");
    const msisdn = parts[1]?.trim();
    if (!msisdn) return;

    batch.push(msisdn);
  };

  try {
    for await (const chunk of stream) {
      const data = Buffer.concat([leftover, chunk]);
      let start = 0;
      let idx;

      while ((idx = data.indexOf(10, start)) !== -1) {
        // 10 = '\n'
        const lineBuf = data.slice(start, idx);
        handleLine(lineBuf, idx - start + 1);
        start = idx + 1;

        if (batch.length >= BATCH_SIZE) {
          batchEndPos = filePos;
          await flushBatch();
        }
      }

      leftover = data.slice(start);
    }

    // trailing line with no final newline
    if (leftover.length > 0) {
      filePos += leftover.length;
      handleLine(leftover, 0); // byte count already added above
    }

    batchEndPos = filePos;
    await flushBatch();
  } finally {
    // Always free this job's share of the concurrency budget, win or lose,
    // so other active/waiting jobs get rebalanced immediately.
    jobBudget.unregister(job.id);
  }

  console.log("🎉 Job completed!");
  console.log("📊 Total Records:", totalProcessed);
  console.log("🗂️ Table:", tableName);

  await queryWithRetry(
    `UPDATE file_entity
     SET status = 'COMPLETED', job_end_date = NOW(), total_record = ?, processed_record = ?
     WHERE id = ?`,
    [totalProcessed, totalProcessed, job.id],
  );
  await SendEmailResults(job, tableName);
  return { totalRecords: totalProcessed, tableName };
}
async function SendEmailResults(job, tableName) {
  try {
    const servicePool = getPoolByService(job.service);

    // Check subscriber table exists in service DB
    const [subscriberTableExists] = await servicePool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'subscriber' LIMIT 1`,
    );
    if (subscriberTableExists.length === 0) {
      console.warn(
        `⚠️ 'subscriber' table missing in ${job.service} DB, skipping export email`,
      );
      return;
    }

    const balanceLimitInCents = Number(job.balance_limit) * 100;

    // Fetch MSISDNs from response table filtered by balance limit
    const [responseRows] = await db.query(
      `SELECT
        msisdn,
        data->>'$.bal' AS balance
       FROM \`${tableName}\`
       WHERE data->>'$.bal' IS NOT NULL
         AND data->>'$.bal' != 'null'
         AND data->>'$.bal' != ''
         AND CAST(data->>'$.bal' AS UNSIGNED) >= ?`,
      [balanceLimitInCents],
    );

    if (responseRows.length === 0) {
      console.log("No records matched the balance limit, skipping email");
      return;
    }

    const msisdnList = responseRows.map((r) => String(r.msisdn));

    // Batch-check against subscriber table
    const BATCH_SIZE = 1000;
    const subscriberSet = new Set();

    if (job.remove_sub == 1) {
      console.log("Applying remove_sub filter...");

      for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
        const batch = msisdnList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => "?").join(", ");

        const [subRows] = await servicePool.query(
          `SELECT cellno FROM subscriber
           WHERE cellno IN (${placeholders})
             AND unsub_dt IS NULL`, // active subscribers only
          batch,
        );

        subRows.forEach((row) => {
          subscriberSet.add(String(row.cellno).replace(/^0/, ""));
        });
      }

      console.log(`Active subscribers to remove: ${subscriberSet.size}`);
    }

    // ─────────────────────────────────────────────
    // STEP 8: Filter recently unsubscribed (remove_unsub)
    // ─────────────────────────────────────────────
    const unsubSet = new Set();

    if (job.remove_unsub == 1) {
      const days = Number(job.days ?? 0);
      console.log(`Applying remove_unsub filter for last ${days} days...`);

      for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
        const batch = msisdnList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => "?").join(", ");

        // Fetch records unsubscribed within the last N days
        const [unsubRows] = await servicePool.query(
          `SELECT cellno FROM subscriber_unsub
           WHERE cellno IN (${placeholders})
             AND unsub_dt >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [...batch, days],
        );

        unsubRows.forEach((row) => {
          unsubSet.add(String(row.cellno).replace(/^0/, ""));
        });
      }

      console.log(`Recently unsubscribed to remove: ${unsubSet.size}`);
    }

    const filteredRows = responseRows.filter((row) => {
      const msisdn = String(row.msisdn);
      if (subscriberSet.has(msisdn)) return false; // remove active sub
      if (unsubSet.has(msisdn)) return false; // remove recent unsub
      return true;
    });

    if (filteredRows.length === 0) {
      console.log("No records left after subscriber filtering, skipping email");
      return;
    }

    // Build Excel in memory
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("data");
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [
      { header: "Sr No", key: "srNo", width: 10 },
      { header: "Msisdn", key: "msisdn", width: 20 },
      { header: "Balance", key: "balance", width: 15 },
    ];

    let serialNo = 1;
    for (const row of filteredRows) {
      sheet.addRow({
        srNo: serialNo++,
        msisdn: row.msisdn,
        balance: row.balance ? Number(row.balance) / 100 : null,
      });
    }

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const fileName = `${job.service}_${tableName}_export.xlsx`;
    const email = "awais@Webdoc.com.pk";

    const mailResult = await sendMail({
      to: email,
      cc: "hamzabhatti021@gmail.com",
      subject: `Export: ${job.file_name} (${job.service})`,
      html: `
        <p>Hi,</p>
        <p>Please find attached the exported data for <strong>${job.file_name}</strong>.</p>
        <ul>
          <li><strong>Service:</strong> ${job.service}</li>
          <li><strong>Total Records:</strong> ${filteredRows.length}</li>
          <li><strong>Balance Limit:</strong> ${job.balance_limit}</li>
        </ul>
        <p>Regards,<br/>WEBDOC System</p>
      `,
      attachments: [
        {
          filename: fileName,
          content: excelBuffer,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    if (!mailResult.success) {
      console.error(
        `❌ Export generated but email failed for job ${job.id}:`,
        mailResult.error,
      );
      return;
    }

    console.log(
      `📧 Export emailed successfully to ${email} (${filteredRows.length} records)`,
    );
  } catch (err) {
    // Don't let an export/email failure mark a completed job as failed
    console.error(`❌ exportAndEmailResults failed for job ${job.id}:`, err);
  }
}
module.exports = processFile;
