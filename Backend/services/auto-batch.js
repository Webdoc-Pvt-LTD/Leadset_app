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

function resolveServiceScheduleTime(scheduleTime) {
  if (!scheduleTime) {
    return toMysqlDatetime(new Date());
  }

  let hours;
  let minutes;
  let seconds = 0;

  if (scheduleTime instanceof Date) {
    hours = scheduleTime.getHours();
    minutes = scheduleTime.getMinutes();
    seconds = scheduleTime.getSeconds();
  } else {
    const parts = String(scheduleTime).split(":");
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    seconds = Number(parts[2] || 0);
  }

  const now = new Date();
  const scheduled = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    seconds,
    0,
  );

  if (scheduled <= now) {
    scheduled.setDate(scheduled.getDate() + 1);
  }

  return toMysqlDatetime(scheduled);
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
    SELECT id, name, schedule_time, batch_size
    FROM services
    WHERE active = TRUE
    ORDER BY id ASC
  `);

  if (!rows.length) {
    throw new Error("No active services found");
  }

  return rows;
}

async function getCursorFromConnection(connection) {
  const [[row]] = await connection.query(`
    SELECT
      COALESCE((
        SELECT MAX(CAST(SUBSTRING_INDEX(job_name, '-', -1) AS UNSIGNED))
        FROM file_entity
        WHERE job_name LIKE 'AUTO-%'
      ), 0) AS last_id,
      (
        SELECT service
        FROM file_entity
        WHERE job_name LIKE 'AUTO-%'
        ORDER BY id DESC
        LIMIT 1
      ) AS last_service
  `);

  return {
    lastId: Number(row?.last_id || 0),
    lastService: row?.last_service || null,
  };
}

async function getCursor() {
  const connection = await db.getConnection();
  try {
    return await getCursorFromConnection(connection);
  } finally {
    connection.release();
  }
}

function pickNextService(services, lastService) {
  if (!lastService) return services[0];

  const lastIdx = services.findIndex((s) => s.name === lastService);
  if (lastIdx === -1) return services[0];

  return services[(lastIdx + 1) % services.length];
}

async function createBatchForService(
  connection,
  service,
  lastId,
  { batchSize, scheduleTime },
) {
  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);

  const [rows] = await connection.query(
    `
    SELECT id, msisdn
    FROM msisdn_list
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
    `,
    [lastId, size],
  );

  if (!rows.length) {
    throw new Error("No available MSISDNs left in msisdn_list");
  }

  const fromId = rows[0].id;
  const toId = rows[rows.length - 1].id;
  const timestamp = Date.now();
  const originalName = `auto_${service.name}_${fromId}_${toId}.txt`;
  const diskName = `${timestamp}-${originalName}`;
  const filePath = path.join(uploadDir, diskName);

  try {
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);

      for (const row of rows) {
        const msisdn = String(row.msisdn || "").replace(/[\r\n]+/g, "").trim();
        if (!msisdn) continue;
        writeStream.write(`${row.id}|${msisdn}\n`);
      }
      writeStream.end();
    });

    const resolvedSchedule =
      scheduleTime || resolveServiceScheduleTime(service.schedule_time);
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
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        /* ignore */
      }
    }
    throw err;
  }
}

/**
 * Create one batch file per active service using each service's batch_size
 * and schedule_time. Files stay PENDING until schedule_time is reached;
 * the file scheduler then picks them up for processing.
 */
async function createBatchesForAllServices() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const services = await getActiveServices();
  const connection = await db.getConnection();
  const results = [];

  try {
    const [[lock]] = await connection.query(
      `SELECT GET_LOCK('leadset_auto_batch', 30) AS acquired`,
    );
    if (!lock || Number(lock.acquired) !== 1) {
      throw new Error("Could not acquire auto-batch lock (another run in progress)");
    }

    let { lastId } = await getCursorFromConnection(connection);

    console.log(
      `📍 MSISDN pool cursor: ${lastId === 0 ? "starting from beginning" : `continuing after id ${lastId}`}`,
    );

    for (const service of services) {
      const batchSize = Math.max(
        1,
        Number(service.batch_size) || DEFAULT_BATCH_SIZE,
      );
      const scheduleTime = resolveServiceScheduleTime(service.schedule_time);

      try {
        const batch = await createBatchForService(connection, service, lastId, {
          batchSize,
          scheduleTime,
        });
        results.push(batch);

        console.log(
          `📦 ${service.name}: assigned msisdn ids ${batch.msisdn_range.from_id}–${batch.msisdn_range.to_id} (${batch.total_record} records)`,
        );

        // Next service (or next day's cron) continues from this batch's last id
        lastId = batch.msisdn_range.to_id;
      } catch (err) {
        if (String(err.message || "").includes("No available MSISDNs")) {
          if (!results.length) {
            throw err;
          }
          break;
        }
        throw err;
      }
    }

    await connection.query(`SELECT RELEASE_LOCK('leadset_auto_batch')`);
    return results;
  } catch (err) {
    try {
      await connection.query(`SELECT RELEASE_LOCK('leadset_auto_batch')`);
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Select next N msisdns (id ASC after last AUTO cursor), write uploads/*.txt,
 * insert PENDING row into file_entity.
 */
async function createBatch({
  batchSize = null,
  serviceName = null,
  scheduleTime = null,
} = {}) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const services = await getActiveServices();
  const connection = await db.getConnection();

  try {
    const [[lock]] = await connection.query(
      `SELECT GET_LOCK('leadset_auto_batch', 30) AS acquired`,
    );
    if (!lock || Number(lock.acquired) !== 1) {
      throw new Error("Could not acquire auto-batch lock (another run in progress)");
    }

    const freshCursor = await getCursorFromConnection(connection);

    let service;
    if (serviceName) {
      service = services.find((s) => s.name === serviceName);
      if (!service) {
        throw new Error(
          `Service "${serviceName}" not found or inactive. Active: ${services.map((s) => s.name).join(", ")}`,
        );
      }
    } else {
      service = pickNextService(services, freshCursor.lastService);
    }

    const size = Math.max(
      1,
      Number(batchSize) || Number(service.batch_size) || DEFAULT_BATCH_SIZE,
    );
    const resolvedSchedule =
      scheduleTime ||
      resolveServiceScheduleTime(service.schedule_time);

    const batch = await createBatchForService(
      connection,
      service,
      freshCursor.lastId,
      {
        batchSize: size,
        scheduleTime: resolvedSchedule,
      },
    );

    await connection.query(`SELECT RELEASE_LOCK('leadset_auto_batch')`);
    return batch;
  } catch (err) {
    try {
      await connection.query(`SELECT RELEASE_LOCK('leadset_auto_batch')`);
    } catch (_) {
      /* ignore */
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
  createBatchesForAllServices,
  resolveServiceScheduleTime,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BALANCE_LIMIT,
  DEFAULT_REMOVE_SUB,
  DEFAULT_REMOVE_UNSUB,
  DEFAULT_DAYS,
};
