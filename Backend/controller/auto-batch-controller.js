const { sendResponse } = require("../lib/api-response");
const autoBatch = require("../services/auto-batch");

/**
 * POST /api/auto/create
 * Manually trigger one batch.
 * Body (optional): { schedule_id, batch_size, service, schedule_time, force }
 */
const createBatch = async (req, res) => {
  try {
    const { batch_size, service, schedule_time, schedule_id, force } =
      req.body || {};

    const batch = await autoBatch.createBatch({
      scheduleId: schedule_id || null,
      batchSize: batch_size,
      serviceName: service || null,
      scheduleTime: schedule_time || null,
      force: force !== false,
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
 * GET /api/auto/status
 */
const getStatus = async (req, res) => {
  try {
    const pool = await autoBatch.getPoolStats();
    const schedules = await autoBatch.getActiveSchedules();

    return sendResponse({
      res,
      success: true,
      message: "Auto batch status",
      statusCode: 200,
      data: {
        pool,
        schedules: schedules.map((s) => ({
          id: s.id,
          service: s.service_name,
          generate_time: autoBatch.normalizeTimeString(s.generate_time),
          process_start_time: autoBatch.normalizeTimeString(
            s.process_start_time,
          ),
          batch_size: s.batch_size,
          label: s.label,
        })),
        defaults: {
          batch_size: autoBatch.DEFAULT_BATCH_SIZE,
          balance_limit: autoBatch.DEFAULT_BALANCE_LIMIT,
          remove_sub: true,
          remove_unsub: false,
          days: autoBatch.DEFAULT_DAYS,
          max_schedules_per_service: autoBatch.MAX_SCHEDULES_PER_SERVICE,
          cron: process.env.AUTO_BATCH_CRON || "* * * * *",
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
 * POST /api/auto/run-now
 * Force-generate files for all active schedule slots.
 */
const runNow = async (req, res) => {
  try {
    const force = req.body?.force !== false;
    const batches = await autoBatch.createBatchesForAllSchedules({ force });
    const pool = await autoBatch.getPoolStats();

    return sendResponse({
      res,
      success: true,
      message: `${batches.length} auto-batch file(s) created`,
      statusCode: 200,
      data: { batches, pool },
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
