// const axios = require("axios");
// const fs = require("fs");
// const pLimit = require("p-limit").default;
// const { queryWithRetry, sleep } = require("../utils/db-retry");

// const CONCURRENCY_LIMIT = Number(process.env.PROCESS_CONCURRENCY) || 25;
// const BATCH_SIZE = Number(process.env.PROCESS_BATCH_SIZE) || 300;
// const HTTP_TIMEOUT_MS = Number(process.env.BALANCE_API_TIMEOUT_MS) || 8000;
// const HTTP_MAX_RETRIES = 3;
// const BALANCE_API_BASE =
//   process.env.BALANCE_API_BASE || "http://192.168.15.156:8091";

// async function createResponseTable(tableName) {
//   console.log(`📦 Creating table: ${tableName}`);
//   await queryWithRetry(`
//     CREATE TABLE IF NOT EXISTS \`${tableName}\` (
//       id BIGINT AUTO_INCREMENT PRIMARY KEY,
//       msisdn VARCHAR(20),
//       data JSON,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     )
//   `);
//   console.log(`✅ Table ready: ${tableName}`);
// }

// async function fetchBalance(msisdn) {
//   const url = `${BALANCE_API_BASE}/balanceQuery/${msisdn}/P`;
//   let lastErr;

//   for (let attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
//     try {
//       const start = Date.now();
//       const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
//       console.log(`✅ ${msisdn} → ${Date.now() - start} ms`);
//       return response.data;
//     } catch (err) {
//       lastErr = err;
//       const retryable =
//         err.code === "ECONNRESET" ||
//         err.code === "ETIMEDOUT" ||
//         err.code === "ECONNREFUSED" ||
//         err.code === "ECONNABORTED" ||
//         (err.response && err.response.status >= 500);

//       if (!retryable || attempt === HTTP_MAX_RETRIES) break;
//       await sleep(300 * attempt);
//     }
//   }
//   throw lastErr;
// }

// async function processBatch(batch, tableName) {
//   let successCount = 0;
//   let failCount = 0;
//   const limit = pLimit(CONCURRENCY_LIMIT);
//   const results = [];

//   await Promise.all(
//     batch.map((msisdn) =>
//       limit(async () => {
//         try {
//           const data = await fetchBalance(msisdn);
//           results.push({ msisdn, data });
//           successCount++;
//         } catch (err) {
//           failCount++;
//           console.error(`❌ Failed for ${msisdn}: ${err.message}`);
//         }
//       }),
//     ),
//   );

//   if (results.length > 0) {
//     const values = results.map((r) => [r.msisdn, JSON.stringify(r.data)]);
//     await queryWithRetry(
//       `INSERT INTO \`${tableName}\` (msisdn, data) VALUES ?`,
//       [values],
//     );
//   }

//   console.log(
//     `📊 Batch result → ✅ ${successCount} success, ❌ ${failCount} failed`,
//   );

//   return { successCount, failCount };
// }

// /**
//  * Checkpointed line reader. Reads raw bytes (not decoded text) so the
//  * byte offset we report back is exact and safe to resume from later —
//  * decoding utf8 in a stream can split multi-byte chars across chunks,
//  * which makes byte accounting unreliable.
//  */
// async function processFile(job) {
//   console.log(`\n🚀 Starting job ID: ${job.id}`);
//   console.log(`📁 File: ${job.file_path || job.file_name}`);

//   const filePath = job.file_path || job.file_name;
//   if (!fs.existsSync(filePath)) {
//     throw new Error(`File not found: ${filePath}`);
//   }

//   const startOffset = Number(job.last_offset) || 0;
//   let tableName = job.response_table_name;

//   if (!tableName) {
//     tableName = `ResponseData_${job.id}_${Date.now()}`;
//     await createResponseTable(tableName);
//     await queryWithRetry(
//       `UPDATE file_entity SET response_table_name = ? WHERE id = ?`,
//       [tableName, job.id],
//     );
//   } else {
//     // table already exists from a previous (interrupted) run
//     await createResponseTable(tableName);
//   }

//   console.log(`📍 Resuming from byte offset: ${startOffset}`);

//   const stream = fs.createReadStream(filePath, { start: startOffset });

//   let leftover = Buffer.alloc(0);
//   let filePos = startOffset;
//   let batch = [];
//   let batchEndPos = filePos;
//   let totalProcessed = Number(job.processed_record) || 0;
//   let batchCount = 0;

//   const flushBatch = async () => {
//     if (batch.length === 0) return;
//     batchCount++;
//     console.log(`📦 Processing batch #${batchCount} (${batch.length} records)`);

//     await processBatch(batch, tableName);
//     totalProcessed += batch.length;

//     // Checkpoint AFTER successful batch processing — this is what makes
//     // a crash mid-job safe: on restart we resume from batchEndPos, never
//     // reprocessing what's already in the response table.
//     await queryWithRetry(
//       `UPDATE file_entity
//        SET last_offset = ?, processed_record = ?, status = 'PROCESSING', job_start_date = COALESCE(job_start_date, NOW())
//        WHERE id = ?`,
//       [batchEndPos, totalProcessed, job.id],
//     );

//     console.log(
//       `✅ Batch #${batchCount} done. Checkpoint @ byte ${batchEndPos}`,
//     );
//     batch = [];
//   };

//   const handleLine = (lineBuf, byteLenIncludingNewline) => {
//     filePos += byteLenIncludingNewline;
//     const line = lineBuf.toString("utf8").trim();
//     if (!line) return;

//     const parts = line.split("|");
//     const msisdn = parts[1]?.trim();
//     if (!msisdn) return;

//     batch.push(msisdn);
//   };

//   for await (const chunk of stream) {
//     const data = Buffer.concat([leftover, chunk]);
//     let start = 0;
//     let idx;

//     while ((idx = data.indexOf(10, start)) !== -1) {
//       // 10 = '\n'
//       const lineBuf = data.slice(start, idx);
//       handleLine(lineBuf, idx - start + 1);
//       start = idx + 1;

//       if (batch.length >= BATCH_SIZE) {
//         batchEndPos = filePos;
//         await flushBatch();
//       }
//     }

//     leftover = data.slice(start);
//   }

//   // trailing line with no final newline
//   if (leftover.length > 0) {
//     filePos += leftover.length;
//     handleLine(leftover, 0); // byte count already added above
//   }

//   batchEndPos = filePos;
//   await flushBatch();

//   console.log("🎉 Job completed!");
//   console.log("📊 Total Records:", totalProcessed);
//   console.log("🗂️ Table:", tableName);

//   await queryWithRetry(
//     `UPDATE file_entity
//      SET status = 'COMPLETED', job_end_date = NOW(), total_record = ?, processed_record = ?
//      WHERE id = ?`,
//     [totalProcessed, totalProcessed, job.id],
//   );

//   return { totalRecords: totalProcessed, tableName };
// }

// module.exports = processFile;
const axios = require("axios");
const http = require("http");
const fs = require("fs");
const { queryWithRetry, sleep } = require("../utils/db-retry");
const jobBudget = require("./job-manager");

// Larger batches mean fewer "stall" gaps between batches (see file-processor
// notes) and fewer DB round-trips, at the cost of reprocessing more records
// if a crash happens mid-batch. 1000 is a reasonable balance for sub-150ms
// API latency; drop it back toward 300 if your latency is higher/jitterier.
const BATCH_SIZE = Number(process.env.PROCESS_BATCH_SIZE) || 1500;
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

  await Promise.all(
    batch.map((msisdn) =>
      semaphore.run(async () => {
        try {
          const data = await fetchBalance(msisdn);
          results.push({ msisdn, data });
          successCount++;
        } catch (err) {
          failCount++;
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

  return { totalRecords: totalProcessed, tableName };
}

module.exports = processFile;
