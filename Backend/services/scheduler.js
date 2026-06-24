const cron = require("node-cron");
const os = require("os");
const db = require("../config/connection");
const { queryWithRetry } = require("../utils/db-retry");
const processFile = require("./file-processor");

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const STUCK_AFTER_MINUTES = 10; // no checkpoint update in this window = assume dead
// How many files can be PROCESSING at once. This does NOT control HTTP
// concurrency (job-budget-manager.js does that) — it just caps how many
// files' streams are open at a time. Set >=2 so jobs scheduled minutes
// apart (like your 10:00pm / 10:10pm files) can run concurrently and
// share the budget instead of queueing behind each other.
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS) || 5;

let runningJobs = 0;

async function claimNextJob() {
  // Pick PENDING jobs that are due, OR PROCESSING jobs whose last checkpoint
  // is stale (worker crashed mid-job). Atomic UPDATE...WHERE acts as the lock:
  // if two cron ticks race, only one UPDATE actually matches+affects a row.
  const [candidates] = await queryWithRetry(`
    SELECT id FROM file_entity
    WHERE (status = 'PENDING' AND (schedule_time IS NULL OR schedule_time <= NOW()))
       OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL ${STUCK_AFTER_MINUTES} MINUTE)
    ORDER BY id ASC
    LIMIT 5
  `);

  for (const candidate of candidates) {
    const [result] = await queryWithRetry(
      `
      UPDATE file_entity
      SET status = 'PROCESSING', locked_at = NOW(), worker_id = ?
      WHERE id = ?
        AND (status = 'PENDING' OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL ${STUCK_AFTER_MINUTES} MINUTE))
      `,
      [WORKER_ID, candidate.id],
    );

    if (result.affectedRows === 1) {
      const [[job]] = await queryWithRetry(
        `SELECT * FROM file_entity WHERE id = ?`,
        [candidate.id],
      );
      return job;
    }
    // someone else claimed it first — try next candidate
  }

  return null;
}

async function runJob(job) {
  runningJobs++;
  console.log(`🔒 Claimed job ${job.id} (worker ${WORKER_ID})`);

  // Heartbeat so other workers don't consider this job "stuck" while it's
  // actively running (file-processor also updates locked_at via checkpoints
  // below, but this covers any gap between batches on huge files).
  const heartbeat = setInterval(() => {
    db.query(`UPDATE file_entity SET locked_at = NOW() WHERE id = ?`, [
      job.id,
    ]).catch((e) => console.error("heartbeat failed:", e.message));
  }, 60_000);

  try {
    await processFile(job);
    console.log(`✅ Job completed ${job.id}`);
  } catch (err) {
    console.error(`❌ Job failed ${job.id}:`, err.message);
    // Leave status as PROCESSING with the checkpoint intact so it auto-resumes
    // next tick once it's past the stuck threshold — UNLESS it's a permanent
    // error (e.g. file missing), in which case mark FAILED so it stops retrying.
    if (err.message?.startsWith("File not found")) {
      await queryWithRetry(
        `UPDATE file_entity SET status = 'FAILED', job_end_date = NOW() WHERE id = ?`,
        [job.id],
      );
    }
  } finally {
    clearInterval(heartbeat);
    runningJobs--;
  }
}

cron.schedule("* * * * *", async () => {
  if (runningJobs >= MAX_CONCURRENT_JOBS) {
    console.log(
      `⏳ At capacity (${runningJobs}/${MAX_CONCURRENT_JOBS}), skipping tick`,
    );
    return;
  }

  console.log("🔎 Checking pending/stuck jobs...");

  try {
    const job = await claimNextJob();
    if (!job) {
      console.log("— nothing to do —");
      return;
    }
    // fire and forget so the cron tick isn't blocked for the whole job duration
    runJob(job);
  } catch (err) {
    console.error("❌ Cron tick error:", err.message);
  }
});
