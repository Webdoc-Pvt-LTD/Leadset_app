const fs = require("fs");
const path = require("path");
const db = require("../config/connection");

const DEFAULT_BATCH_SIZE = Number(process.env.AUTO_BATCH_SIZE) || 100000;
const DEFAULT_BALANCE_LIMIT = Number(process.env.AUTO_BATCH_BALANCE_LIMIT) || 10;
const DEFAULT_REMOVE_SUB = 1;
const DEFAULT_REMOVE_UNSUB = 0;
const DEFAULT_DAYS = 0;

const uploadDir = path.join(__dirname, "../uploads");

function toMysqlDatetime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function getPoolStats() {
  const [[stats]] = await db.query(`
    SELECT
      COUNT(*) AS total,
      COALESCE((
        SELECT MAX(CAST(SUBSTRING_INDEX(job_name, '-', -1) AS UNSIGNED))
        FROM file_entity
        WHERE job_name LIKE 'AUTO-%'
      ), 0) AS last_assigned_id
    FROM msisdn_list
  `);

  const total = Number(stats.total || 0);
  const lastAssignedId = Number(stats.last_assigned_id || 0);

  return {
    total,
    last_assigned_id: lastAssignedId,
    remaining: Math.max(0, total - lastAssignedId),
  };
}

async function getActiveServices() {
  const [rows] = await db.query(`
    SELECT id, name
    FROM services
    WHERE active = TRUE
    ORDER BY id ASC
  `);

  if (!rows.length) {
    throw new Error("No active services found");
  }

  return rows;
}

async function getCursor() {
  const [[row]] = await db.query(`
    SELECT service, job_name
    FROM file_entity
    WHERE job_name LIKE 'AUTO-%'
    ORDER BY id DESC
    LIMIT 1
  `);

  if (!row) {
    return { lastId: 0, lastService: null };
  }

  const match = String(row.job_name).match(/^AUTO-(.+)-(\d+)-(\d+)$/);
  return {
    lastId: match ? Number(match[3]) : 0,
    lastService: row.service || null,
  };
}

function pickNextService(services, lastService) {
  if (!lastService) return services[0];

  const lastIdx = services.findIndex((s) => s.name === lastService);
  if (lastIdx === -1) return services[0];

  return services[(lastIdx + 1) % services.length];
}

/**
 * Select next N msisdns (id ASC after last AUTO cursor), write uploads/*.txt,
 * insert PENDING row into file_entity.
 */
async function createBatch({
  batchSize = DEFAULT_BATCH_SIZE,
  serviceName = null,
  scheduleTime = null,
} = {}) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);
  const services = await getActiveServices();
  const cursor = await getCursor();

  let service;
  if (serviceName) {
    service = services.find((s) => s.name === serviceName);
    if (!service) {
      throw new Error(
        `Service "${serviceName}" not found or inactive. Active: ${services.map((s) => s.name).join(", ")}`,
      );
    }
  } else {
    service = pickNextService(services, cursor.lastService);
  }

  const connection = await db.getConnection();
  let filePath = null;

  try {
    // Prevent overlapping cron/API runs from claiming the same ids
    const [[lock]] = await connection.query(
      `SELECT GET_LOCK('leadset_auto_batch', 30) AS acquired`,
    );
    if (!lock || Number(lock.acquired) !== 1) {
      throw new Error("Could not acquire auto-batch lock (another run in progress)");
    }

    // Re-read cursor under lock
    const freshCursor = await (async () => {
      const [[row]] = await connection.query(`
        SELECT service, job_name
        FROM file_entity
        WHERE job_name LIKE 'AUTO-%'
        ORDER BY id DESC
        LIMIT 1
      `);
      if (!row) return { lastId: 0, lastService: null };
      const match = String(row.job_name).match(/^AUTO-(.+)-(\d+)-(\d+)$/);
      return {
        lastId: match ? Number(match[3]) : 0,
        lastService: row.service || null,
      };
    })();

    if (!serviceName) {
      service = pickNextService(services, freshCursor.lastService);
    }

    const [rows] = await connection.query(
      `
      SELECT id, msisdn
      FROM msisdn_list
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ?
      `,
      [freshCursor.lastId, size],
    );

    if (!rows.length) {
      throw new Error("No available MSISDNs left in msisdn_list");
    }

    const fromId = rows[0].id;
    const toId = rows[rows.length - 1].id;
    const timestamp = Date.now();
    // DB file_name matches your existing style (e.g. balanceBase_4000001_5000000.txt)
    // Disk path keeps a unique timestamp prefix like multer uploads
    const originalName = `auto_${service.name}_${fromId}_${toId}.txt`;
    const diskName = `${timestamp}-${originalName}`;
    filePath = path.join(uploadDir, diskName);

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);

      for (const row of rows) {
        const msisdn = String(row.msisdn || "").replace(/[\r\n]+/g, "").trim();
        if (!msisdn) continue;
        // Same format as your uploads: id|msisdn
        writeStream.write(`${row.id}|${msisdn}\n`);
      }
      writeStream.end();
    });

    // NULL = due immediately (scheduler: schedule_time IS NULL OR <= NOW()).
    // Avoid writing local-clock strings that can sit "in the future" vs MySQL NOW().
    const resolvedSchedule = scheduleTime || toMysqlDatetime(new Date());
    // Cursor key — must stay AUTO-{service}-{from}-{to} so we never re-use ids
    const jobName = `AUTO-${service.name}-${fromId}-${toId}`;
    const totalRecord = rows.length;

    const [insertResult] = await connection.query(
      `
      INSERT INTO file_entity
      (
        file_name,
        file_path,
        job_name,
        schedule_time,
        total_record,
        balance_limit,
        service,
        remove_sub,
        remove_unsub,
        days,
        upload_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'PENDING')
      `,
      [
        originalName,
        path.resolve(filePath),
        jobName,
        resolvedSchedule,
        totalRecord,
        DEFAULT_BALANCE_LIMIT,
        service.name,
        DEFAULT_REMOVE_SUB,
        DEFAULT_REMOVE_UNSUB,
        DEFAULT_DAYS,
      ],
    );

    await connection.query(`SELECT RELEASE_LOCK('leadset_auto_batch')`);

    return {
      file_entity_id: insertResult.insertId,
      service: service.name,
      service_id: service.id,
      file_name: originalName,
      file_path: path.resolve(filePath),
      job_name: jobName,
      schedule_time: resolvedSchedule,
      total_record: totalRecord,
      msisdn_range: { from_id: fromId, to_id: toId },
      balance_limit: DEFAULT_BALANCE_LIMIT,
      remove_sub: true,
      remove_unsub: false,
      days: DEFAULT_DAYS,
      requested_batch_size: size,
      shortfall: size - totalRecord,
    };
  } catch (err) {
    try {
      await connection.query(`SELECT RELEASE_LOCK('leadset_auto_batch')`);
    } catch (_) {
      /* ignore */
    }
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        /* ignore */
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  getPoolStats,
  getActiveServices,
  createBatch,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BALANCE_LIMIT,
  DEFAULT_REMOVE_SUB,
  DEFAULT_REMOVE_UNSUB,
  DEFAULT_DAYS,
};
