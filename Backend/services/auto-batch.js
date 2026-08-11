const fs = require("fs");
const path = require("path");
const db = require("../config/connection");

const DEFAULT_BATCH_SIZE = Number(process.env.AUTO_BATCH_SIZE) || 100000;
const DEFAULT_BALANCE_LIMIT = Number(process.env.AUTO_BATCH_BALANCE_LIMIT) || 10;
const DEFAULT_REMOVE_SUB = 1;
const DEFAULT_REMOVE_UNSUB = 0;
const DEFAULT_DAYS = 0;
const MAX_SCHEDULES_PER_SERVICE = 5;

const uploadDir = path.join(__dirname, "../uploads");

function toMysqlDatetime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseTimeParts(timeValue) {
  const parts = String(timeValue).split(":");
  return {
    hours: Number(parts[0]),
    minutes: Number(parts[1]),
    seconds: Number(parts[2] || 0),
  };
}

function normalizeTimeString(timeValue) {
  const { hours, minutes, seconds } = parseTimeParts(timeValue);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function currentTimeKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Same-day process time when process is after generate; next day if process
 * is earlier on the clock (e.g. generate 22:00, process 06:00).
 */
function resolveProcessStartDatetime(generateTime, processStartTime, baseDate = new Date()) {
  const gen = parseTimeParts(generateTime);
  const proc = parseTimeParts(processStartTime);

  const generateDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    gen.hours,
    gen.minutes,
    gen.seconds,
    0,
  );

  const processDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    proc.hours,
    proc.minutes,
    proc.seconds,
    0,
  );

  if (processDate <= generateDate) {
    processDate.setDate(processDate.getDate() + 1);
  }

  return toMysqlDatetime(processDate);
}

async function getPoolStats() {
  const [[stats]] = await db.query(`
    SELECT
      COUNT(*) AS total,
      COALESCE((
        SELECT MAX(last_msisdn_id) FROM service_msisdn_cursor
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

async function getServiceCursor(connection, serviceId, serviceName) {
  const [[row]] = await connection.query(
    `SELECT last_msisdn_id FROM service_msisdn_cursor WHERE service_id = ?`,
    [serviceId],
  );

  if (row) {
    return Number(row.last_msisdn_id || 0);
  }

  const [[derived]] = await connection.query(
    `
    SELECT COALESCE(
      MAX(CAST(SUBSTRING_INDEX(job_name, '-', -1) AS UNSIGNED)),
      0
    ) AS last_id
    FROM file_entity
    WHERE service = ? AND job_name LIKE 'AUTO-%'
    `,
    [serviceName],
  );

  const lastId = Number(derived?.last_id || 0);

  await connection.query(
    `
    INSERT INTO service_msisdn_cursor (service_id, last_msisdn_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE last_msisdn_id = GREATEST(last_msisdn_id, VALUES(last_msisdn_id))
    `,
    [serviceId, lastId],
  );

  return lastId;
}

async function setServiceCursor(connection, serviceId, lastMsisdnId) {
  await connection.query(
    `
    INSERT INTO service_msisdn_cursor (service_id, last_msisdn_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE last_msisdn_id = VALUES(last_msisdn_id)
    `,
    [serviceId, lastMsisdnId],
  );
}

async function getActiveSchedules(connection = db) {
  const [rows] = await connection.query(`
    SELECT
      sfs.id,
      sfs.service_id,
      sfs.generate_time,
      sfs.process_start_time,
      sfs.batch_size,
      sfs.label,
      sfs.sort_order,
      s.name AS service_name
    FROM service_file_schedules sfs
    INNER JOIN services s ON s.id = sfs.service_id
    WHERE sfs.active = TRUE AND s.active = TRUE
    ORDER BY s.id ASC, sfs.sort_order ASC, sfs.generate_time ASC
  `);

  return rows;
}

async function getDueSchedules(timeKey = currentTimeKey(), connection = db) {
  const [rows] = await connection.query(
    `
    SELECT
      sfs.id,
      sfs.service_id,
      sfs.generate_time,
      sfs.process_start_time,
      sfs.batch_size,
      sfs.label,
      s.name AS service_name
    FROM service_file_schedules sfs
    INNER JOIN services s ON s.id = sfs.service_id
    WHERE sfs.active = TRUE
      AND s.active = TRUE
      AND TIME_FORMAT(sfs.generate_time, '%H:%i') = ?
      AND NOT EXISTS (
        SELECT 1 FROM service_generation_log sgl
        WHERE sgl.schedule_id = sfs.id
          AND sgl.generation_date = CURDATE()
      )
    ORDER BY sfs.id ASC
    `,
    [timeKey],
  );

  return rows;
}

async function hasGeneratedToday(connection, scheduleId) {
  const [[row]] = await connection.query(
    `
    SELECT 1 AS found
    FROM service_generation_log
    WHERE schedule_id = ? AND generation_date = CURDATE()
    LIMIT 1
    `,
    [scheduleId],
  );

  return Boolean(row?.found);
}

async function createBatchForSchedule(
  connection,
  schedule,
  { force = false, processTimeOverride = null } = {},
) {
  if (!force && (await hasGeneratedToday(connection, schedule.id))) {
    throw new Error(
      `Schedule #${schedule.id} (${schedule.service_name}) already generated today`,
    );
  }

  const batchSize = Math.max(1, Number(schedule.batch_size) || DEFAULT_BATCH_SIZE);
  const lastId = await getServiceCursor(
    connection,
    schedule.service_id,
    schedule.service_name,
  );

  const [rows] = await connection.query(
    `
    SELECT id, msisdn
    FROM msisdn_list
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
    `,
    [lastId, batchSize],
  );

  if (!rows.length) {
    throw new Error("No available MSISDNs left in msisdn_list");
  }

  const fromId = rows[0].id;
  const toId = rows[rows.length - 1].id;
  const timestamp = Date.now();
  const originalName = `auto_${schedule.service_name}_${fromId}_${toId}.txt`;
  const diskName = `${timestamp}-${originalName}`;
  const filePath = path.join(uploadDir, diskName);

  const resolvedSchedule =
    processTimeOverride ||
    resolveProcessStartDatetime(
      schedule.generate_time,
      schedule.process_start_time,
    );

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

    const jobName = `AUTO-${schedule.service_name}-${fromId}-${toId}`;
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
        schedule_id,
        remove_sub,
        remove_unsub,
        days,
        upload_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'PENDING')
      `,
      [
        originalName,
        path.resolve(filePath),
        jobName,
        resolvedSchedule,
        totalRecord,
        DEFAULT_BALANCE_LIMIT,
        schedule.service_name,
        schedule.id,
        DEFAULT_REMOVE_SUB,
        DEFAULT_REMOVE_UNSUB,
        DEFAULT_DAYS,
      ],
    );

    await connection.query(
      `
      INSERT INTO service_generation_log (schedule_id, service_id, generation_date, file_entity_id)
      VALUES (?, ?, CURDATE(), ?)
      ON DUPLICATE KEY UPDATE file_entity_id = VALUES(file_entity_id)
      `,
      [schedule.id, schedule.service_id, insertResult.insertId],
    );

    await setServiceCursor(connection, schedule.service_id, toId);

    return {
      file_entity_id: insertResult.insertId,
      schedule_id: schedule.id,
      service: schedule.service_name,
      service_id: schedule.service_id,
      file_name: originalName,
      file_path: path.resolve(filePath),
      job_name: jobName,
      generate_time: normalizeTimeString(schedule.generate_time),
      process_start_time: normalizeTimeString(schedule.process_start_time),
      schedule_time: resolvedSchedule,
      total_record: totalRecord,
      msisdn_range: { from_id: fromId, to_id: toId },
      balance_limit: DEFAULT_BALANCE_LIMIT,
      remove_sub: true,
      remove_unsub: false,
      days: DEFAULT_DAYS,
      requested_batch_size: batchSize,
      shortfall: batchSize - totalRecord,
      label: schedule.label || null,
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
 * Cron tick: create files for schedule slots whose generate_time matches now.
 */
async function createBatchesForDueSchedules() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const dueSchedules = await getDueSchedules();
  if (!dueSchedules.length) {
    return [];
  }

  const connection = await db.getConnection();
  const results = [];

  try {
    const [[lock]] = await connection.query(
      `SELECT GET_LOCK('leadset_auto_batch', 30) AS acquired`,
    );
    if (!lock || Number(lock.acquired) !== 1) {
      throw new Error("Could not acquire auto-batch lock (another run in progress)");
    }

    for (const schedule of dueSchedules) {
      try {
        const batch = await createBatchForSchedule(connection, schedule);
        results.push(batch);
        console.log(
          `📦 ${schedule.service_name} [schedule #${schedule.id}]: ` +
            `ids ${batch.msisdn_range.from_id}–${batch.msisdn_range.to_id} ` +
            `(${batch.total_record} records, process @ ${batch.schedule_time})`,
        );
      } catch (err) {
        if (String(err.message || "").includes("No available MSISDNs")) {
          console.log(`— auto-batch: msisdn_list exhausted at schedule #${schedule.id} —`);
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
 * Manual run: generate files for all active schedules (ignores generate_time).
 */
async function createBatchesForAllSchedules({ force = true } = {}) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const schedules = await getActiveSchedules();
  if (!schedules.length) {
    return [];
  }

  const connection = await db.getConnection();
  const results = [];

  try {
    const [[lock]] = await connection.query(
      `SELECT GET_LOCK('leadset_auto_batch', 30) AS acquired`,
    );
    if (!lock || Number(lock.acquired) !== 1) {
      throw new Error("Could not acquire auto-batch lock (another run in progress)");
    }

    for (const schedule of schedules) {
      try {
        const batch = await createBatchForSchedule(connection, schedule, { force });
        results.push(batch);
      } catch (err) {
        if (String(err.message || "").includes("already generated today")) {
          continue;
        }
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
 * Manual: create one batch for a schedule_id or service name override.
 */
async function createBatch({
  scheduleId = null,
  batchSize = null,
  serviceName = null,
  scheduleTime = null,
  force = true,
} = {}) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const connection = await db.getConnection();

  try {
    const [[lock]] = await connection.query(
      `SELECT GET_LOCK('leadset_auto_batch', 30) AS acquired`,
    );
    if (!lock || Number(lock.acquired) !== 1) {
      throw new Error("Could not acquire auto-batch lock (another run in progress)");
    }

    let schedule;

    if (scheduleId) {
      const [[row]] = await connection.query(
        `
        SELECT
          sfs.id,
          sfs.service_id,
          sfs.generate_time,
          sfs.process_start_time,
          sfs.batch_size,
          sfs.label,
          s.name AS service_name
        FROM service_file_schedules sfs
        INNER JOIN services s ON s.id = sfs.service_id
        WHERE sfs.id = ? AND sfs.active = TRUE AND s.active = TRUE
        `,
        [scheduleId],
      );

      if (!row) {
        throw new Error(`Schedule #${scheduleId} not found or inactive`);
      }

      schedule = row;
    } else {
      const services = await getActiveServices();
      const service = serviceName
        ? services.find((s) => s.name === serviceName)
        : services[0];

      if (!service) {
        throw new Error(
          serviceName
            ? `Service "${serviceName}" not found or inactive`
            : "No active services found",
        );
      }

      const [schedules] = await connection.query(
        `
        SELECT
          sfs.id,
          sfs.service_id,
          sfs.generate_time,
          sfs.process_start_time,
          sfs.batch_size,
          sfs.label,
          s.name AS service_name
        FROM service_file_schedules sfs
        INNER JOIN services s ON s.id = sfs.service_id
        WHERE sfs.service_id = ? AND sfs.active = TRUE
        ORDER BY sfs.sort_order ASC, sfs.generate_time ASC
        LIMIT 1
        `,
        [service.id],
      );

      if (!schedules.length) {
        throw new Error(`No active schedules configured for service "${service.name}"`);
      }

      schedule = schedules[0];
    }

    if (batchSize != null) {
      schedule = { ...schedule, batch_size: batchSize };
    }

    const batch = await createBatchForSchedule(connection, schedule, {
      force,
      processTimeOverride: scheduleTime,
    });

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
  getActiveSchedules,
  getDueSchedules,
  createBatch,
  createBatchesForDueSchedules,
  createBatchesForAllSchedules,
  resolveProcessStartDatetime,
  normalizeTimeString,
  currentTimeKey,
  MAX_SCHEDULES_PER_SERVICE,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BALANCE_LIMIT,
  DEFAULT_REMOVE_SUB,
  DEFAULT_REMOVE_UNSUB,
  DEFAULT_DAYS,
};
