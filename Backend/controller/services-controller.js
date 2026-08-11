const db = require("../config/connection");
const { sendResponse } = require("../lib/api-response");
const {
  MAX_SCHEDULES_PER_SERVICE,
  normalizeTimeString,
} = require("../services/auto-batch");

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function normalizeTimeInput(timeValue) {
  const trimmed = String(timeValue).trim();
  if (!TIME_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

function validateSchedulePayload(body, { partial = false } = {}) {
  const errors = [];
  const result = {};

  if (!partial || body.generate_time !== undefined) {
    const generateTime = normalizeTimeInput(body.generate_time);
    if (!generateTime) {
      errors.push("Invalid or missing generate_time (HH:mm)");
    } else {
      result.generate_time = generateTime;
    }
  }

  if (!partial || body.process_start_time !== undefined) {
    const processStartTime = normalizeTimeInput(body.process_start_time);
    if (!processStartTime) {
      errors.push("Invalid or missing process_start_time (HH:mm)");
    } else {
      result.process_start_time = processStartTime;
    }
  }

  if (!partial || body.batch_size !== undefined) {
    const batchSize = Number(body.batch_size);
    if (!Number.isFinite(batchSize) || batchSize <= 0) {
      errors.push("batch_size must be greater than 0");
    } else {
      result.batch_size = batchSize;
    }
  }

  if (body.label !== undefined) {
    result.label =
      body.label == null || String(body.label).trim() === ""
        ? null
        : String(body.label).trim().slice(0, 100);
  }

  if (body.active !== undefined) {
    result.active = body.active ? 1 : 0;
  }

  if (body.sort_order !== undefined) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 4) {
      errors.push("sort_order must be an integer between 0 and 4");
    } else {
      result.sort_order = sortOrder;
    }
  }

  return { errors, data: result };
}

async function fetchSchedulesForService(serviceId) {
  const [rows] = await db.query(
    `
    SELECT
      id,
      service_id,
      generate_time,
      process_start_time,
      batch_size,
      label,
      active,
      sort_order
    FROM service_file_schedules
    WHERE service_id = ?
    ORDER BY sort_order ASC, generate_time ASC
    `,
    [serviceId],
  );

  return rows.map((row) => ({
    ...row,
    generate_time: normalizeTimeString(row.generate_time),
    process_start_time: normalizeTimeString(row.process_start_time),
    active: Boolean(row.active),
  }));
}

const getServices = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, name
      FROM services
      WHERE active = TRUE
      ORDER BY id DESC
    `);

    const services = await Promise.all(
      rows.map(async (service) => ({
        ...service,
        schedules: await fetchSchedulesForService(service.id),
      })),
    );

    return sendResponse({
      res,
      success: true,
      message: "Services fetched successfully",
      statusCode: 200,
      data: services,
    });
  } catch (error) {
    console.error("Error fetching services:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch services",
      statusCode: 500,
      error: error.message,
    });
  }
};

const getServiceQuota = async (req, res) => {
  try {
    const { service_id } = req.params;

    if (!service_id) {
      return sendResponse({
        res,
        success: false,
        message: "Service id is required",
        statusCode: 400,
      });
    }

    const query = `
      SELECT
        csa.id,
        csa.service_id,
        s.name AS service_name,
        csa.center_id,
        c.name AS center_name,
        csa.percentage_quota,
        csa.poc_email,
        csa.cc_email
      FROM center_service_assignment csa
      INNER JOIN services s ON s.id = csa.service_id
      INNER JOIN centers c ON c.id = csa.center_id
      WHERE csa.service_id = ?
      ORDER BY csa.id DESC
    `;

    const [rows] = await db.query(query, [service_id]);

    const assignedQuota = rows.reduce(
      (sum, item) => sum + Number(item.percentage_quota),
      0,
    );

    return sendResponse({
      res,
      success: true,
      message: "Service quota fetched successfully",
      statusCode: 200,
      data: {
        service_id: Number(service_id),
        service_name: rows.length ? rows[0].service_name : null,
        assigned_quota: Number(assignedQuota.toFixed(2)),
        remaining_quota: Number((100 - assignedQuota).toFixed(2)),
        centers: rows.map((item) => ({
          id: item.id,
          center_id: item.center_id,
          center_name: item.center_name,
          percentage_quota: item.percentage_quota,
          poc_email: item.poc_email,
          cc_email: item.cc_email,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching service quota:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch service quota",
      statusCode: 500,
      error: error.message,
    });
  }
};

const getSchedules = async (req, res) => {
  try {
    const { service_id } = req.params;

    const [[service]] = await db.query(
      `SELECT id, name FROM services WHERE id = ? AND active = TRUE`,
      [service_id],
    );

    if (!service) {
      return sendResponse({
        res,
        success: false,
        message: "Service not found",
        statusCode: 404,
      });
    }

    const schedules = await fetchSchedulesForService(service_id);

    return sendResponse({
      res,
      success: true,
      message: "Schedules fetched successfully",
      statusCode: 200,
      data: {
        service_id: Number(service_id),
        service_name: service.name,
        schedules,
        max_schedules: MAX_SCHEDULES_PER_SERVICE,
      },
    });
  } catch (error) {
    console.error("Error fetching schedules:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch schedules",
      statusCode: 500,
      error: error.message,
    });
  }
};

const createSchedule = async (req, res) => {
  try {
    const { service_id } = req.params;
    const { errors, data } = validateSchedulePayload(req.body || {});

    if (errors.length) {
      return sendResponse({
        res,
        success: false,
        message: errors.join("; "),
        statusCode: 400,
      });
    }

    const [[service]] = await db.query(
      `SELECT id, name FROM services WHERE id = ? AND active = TRUE`,
      [service_id],
    );

    if (!service) {
      return sendResponse({
        res,
        success: false,
        message: "Service not found",
        statusCode: 404,
      });
    }

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM service_file_schedules WHERE service_id = ?`,
      [service_id],
    );

    if (Number(countRow.total) >= MAX_SCHEDULES_PER_SERVICE) {
      return sendResponse({
        res,
        success: false,
        message: `Maximum ${MAX_SCHEDULES_PER_SERVICE} file schedules allowed per service`,
        statusCode: 400,
      });
    }

    const sortOrder =
      data.sort_order ??
      Math.min(Number(countRow.total), MAX_SCHEDULES_PER_SERVICE - 1);

    const [insertResult] = await db.query(
      `
      INSERT INTO service_file_schedules (
        service_id,
        generate_time,
        process_start_time,
        batch_size,
        label,
        active,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, 1, ?)
      `,
      [
        service_id,
        data.generate_time,
        data.process_start_time,
        data.batch_size,
        data.label ?? null,
        sortOrder,
      ],
    );

    const schedules = await fetchSchedulesForService(service_id);

    return sendResponse({
      res,
      success: true,
      message: "Schedule created successfully",
      statusCode: 201,
      data: {
        id: insertResult.insertId,
        service_id: Number(service_id),
        schedules,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return sendResponse({
        res,
        success: false,
        message: "A schedule with this generate_time already exists for this service",
        statusCode: 409,
      });
    }

    console.error("Error creating schedule:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to create schedule",
      statusCode: 500,
      error: error.message,
    });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const { schedule_id } = req.params;
    const { errors, data } = validateSchedulePayload(req.body || {}, {
      partial: true,
    });

    if (errors.length) {
      return sendResponse({
        res,
        success: false,
        message: errors.join("; "),
        statusCode: 400,
      });
    }

    if (!Object.keys(data).length) {
      return sendResponse({
        res,
        success: false,
        message: "No valid fields to update",
        statusCode: 400,
      });
    }

    const [[existing]] = await db.query(
      `SELECT id, service_id FROM service_file_schedules WHERE id = ?`,
      [schedule_id],
    );

    if (!existing) {
      return sendResponse({
        res,
        success: false,
        message: "Schedule not found",
        statusCode: 404,
      });
    }

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }

    values.push(schedule_id);

    await db.query(
      `UPDATE service_file_schedules SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );

    const schedules = await fetchSchedulesForService(existing.service_id);

    return sendResponse({
      res,
      success: true,
      message: "Schedule updated successfully",
      statusCode: 200,
      data: {
        id: Number(schedule_id),
        service_id: existing.service_id,
        schedules,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return sendResponse({
        res,
        success: false,
        message: "A schedule with this generate_time already exists for this service",
        statusCode: 409,
      });
    }

    console.error("Error updating schedule:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to update schedule",
      statusCode: 500,
      error: error.message,
    });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const { schedule_id } = req.params;

    const [[existing]] = await db.query(
      `SELECT id, service_id FROM service_file_schedules WHERE id = ?`,
      [schedule_id],
    );

    if (!existing) {
      return sendResponse({
        res,
        success: false,
        message: "Schedule not found",
        statusCode: 404,
      });
    }

    await db.query(`DELETE FROM service_file_schedules WHERE id = ?`, [
      schedule_id,
    ]);

    const schedules = await fetchSchedulesForService(existing.service_id);

    return sendResponse({
      res,
      success: true,
      message: "Schedule deleted successfully",
      statusCode: 200,
      data: {
        id: Number(schedule_id),
        service_id: existing.service_id,
        schedules,
      },
    });
  } catch (error) {
    console.error("Error deleting schedule:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to delete schedule",
      statusCode: 500,
      error: error.message,
    });
  }
};

/** @deprecated Use schedule CRUD instead. Kept for backward compatibility. */
const updateService = async (req, res) => {
  try {
    const { service_id } = req.params;
    const { schedule_time, batch_size } = req.body;

    if (!service_id) {
      return sendResponse({
        res,
        success: false,
        message: "Service id is required",
        statusCode: 400,
      });
    }

    const generateTime = normalizeTimeInput(req.body.generate_time);
    const processStartTime =
      normalizeTimeInput(req.body.process_start_time) ||
      normalizeTimeInput(schedule_time);

    if (!processStartTime) {
      return sendResponse({
        res,
        success: false,
        message: "process_start_time (or schedule_time) is required",
        statusCode: 400,
      });
    }

    if (batch_size == null || Number(batch_size) <= 0) {
      return sendResponse({
        res,
        success: false,
        message: "Batch size must be greater than 0",
        statusCode: 400,
      });
    }

    const [[service]] = await db.query(
      `SELECT id FROM services WHERE id = ? AND active = TRUE`,
      [service_id],
    );

    if (!service) {
      return sendResponse({
        res,
        success: false,
        message: "Service not found",
        statusCode: 404,
      });
    }

    const schedules = await fetchSchedulesForService(service_id);

    if (schedules.length === 0) {
      const resolvedGenerate =
        generateTime ||
        normalizeTimeString(
          new Date(Date.now() - 3600000).toTimeString().slice(0, 8),
        );

      await db.query(
        `
        INSERT INTO service_file_schedules (
          service_id, generate_time, process_start_time, batch_size, sort_order
        ) VALUES (?, ?, ?, ?, 0)
        `,
        [service_id, resolvedGenerate, processStartTime, Number(batch_size)],
      );
    } else {
      await db.query(
        `
        UPDATE service_file_schedules
        SET
          generate_time = COALESCE(?, generate_time),
          process_start_time = ?,
          batch_size = ?
        WHERE id = ?
        `,
        [
          generateTime,
          processStartTime,
          Number(batch_size),
          schedules[0].id,
        ],
      );
    }

    await db.query(
      `
      UPDATE services
      SET schedule_time = ?, batch_size = ?
      WHERE id = ?
      `,
      [processStartTime, Number(batch_size), service_id],
    );

    const updatedSchedules = await fetchSchedulesForService(service_id);

    return sendResponse({
      res,
      success: true,
      message: "Service schedule updated successfully",
      statusCode: 200,
      data: {
        id: Number(service_id),
        schedules: updatedSchedules,
      },
    });
  } catch (error) {
    console.error("Error updating service:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to update service",
      statusCode: 500,
      error: error.message,
    });
  }
};

module.exports = {
  getServices,
  getServiceQuota,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  updateService,
};
