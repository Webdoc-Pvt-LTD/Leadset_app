const { sendResponse } = require("../lib/api-response");
const autoBatch = require("../services/auto-batch");

/**
 * POST /api/auto-batch/create
 * Manually trigger one batch (same logic as cron).
 * Body (optional): { batch_size, service, schedule_time }
 */
const createBatch = async (req, res) => {
  try {
    const { batch_size, service, schedule_time } = req.body || {};

    const batch = await autoBatch.createBatch({
      batchSize: batch_size,
      serviceName: service || null,
      scheduleTime: schedule_time || null,
    });

    const pool = await autoBatch.getPoolStats();

    return sendResponse({
      res,
      success: true,
      message: "Auto batch created successfully",
      statusCode: 200,
      data: { batch, pool },
    });
  } catch (error) {
    console.error("auto-batch create error:", error);
    return sendResponse({
      res,
      success: false,
      message: error.message || "Failed to create auto batch",
      statusCode: 500,
      error: error.message,
    });
  }
};

/**
 * GET /api/auto-batch/status
 */
const getStatus = async (req, res) => {
  try {
    const pool = await autoBatch.getPoolStats();
    const services = await autoBatch.getActiveServices();

    return sendResponse({
      res,
      success: true,
      message: "Auto batch status",
      statusCode: 200,
      data: {
        pool,
        services: services.map((s) => s.name),
        defaults: {
          batch_size: autoBatch.DEFAULT_BATCH_SIZE,
          balance_limit: autoBatch.DEFAULT_BALANCE_LIMIT,
          remove_sub: true,
          remove_unsub: false,
          days: autoBatch.DEFAULT_DAYS,
          cron: process.env.AUTO_BATCH_CRON || "0 * * * *",
          enabled: process.env.AUTO_BATCH_ENABLED !== "false",
        },
      },
    });
  } catch (error) {
    console.error("auto-batch status error:", error);
    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch auto batch status",
      statusCode: 500,
      error: error.message,
    });
  }
};

/**
 * POST /api/auto-batch/run-now
 * Fire the same path the cron uses (next service in rotation).
 */
const runNow = async (req, res) => {
  try {
    const {schedule_time} = req.body || {};
    const batch = await autoBatch.createBatch({
      batchSize: autoBatch.DEFAULT_BATCH_SIZE,
      scheduleTime: schedule_time || null,
    });
    const pool = await autoBatch.getPoolStats();
    return sendResponse({
      res,
      success: true,
      message: "Auto-batch created",
      statusCode: 200,
      data: { batch, pool },
    });
  } catch (error) {
    return sendResponse({
      res,
      success: false,
      message: error.message || "Auto-batch run failed",
      statusCode: 500,
      error: error.message,
    });
  }
};

module.exports = {
  createBatch,
  getStatus,
  runNow,
};
