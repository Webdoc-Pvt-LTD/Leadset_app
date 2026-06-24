const db = require("../config/connection");

const RETRYABLE_CODES = new Set([
  "PROTOCOL_CONNECTION_LOST",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_CON_COUNT_ERROR",
]);

function isRetryable(err) {
  return RETRYABLE_CODES.has(err.code) || err.fatal === true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs db.query with retry + exponential backoff on transient failures.
 * Non-retryable errors (bad SQL, constraint violations, etc.) throw immediately.
 */
async function queryWithRetry(sql, params = [], opts = {}) {
  const maxRetries = opts.maxRetries ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let attempt = 0;

  while (true) {
    try {
      return await db.query(sql, params);
    } catch (err) {
      attempt++;

      if (!isRetryable(err) || attempt > maxRetries) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `⚠️ DB query failed (${err.code || err.message}), retry ${attempt}/${maxRetries} in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
}

module.exports = { queryWithRetry, isRetryable, sleep };
