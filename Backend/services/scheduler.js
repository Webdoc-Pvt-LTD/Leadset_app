const cron = require("node-cron");
const os = require("os");
const fs = require("fs");
const db = require("../config/connection");
const { queryWithRetry } = require("../utils/db-retry");
const processFile = require("./file-processor");

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const STUCK_AFTER_MINUTES = 10; // no checkpoint update in this window = assume dead
const STUCK_INTERVAL = `INTERVAL ${STUCK_AFTER_MINUTES} MINUTE`;

// Shared claim rules (SELECT + UPDATE must stay in sync):
// - PENDING + due (schedule_time null or passed)
// - PENDING + never locked but overdue (due for STUCK_AFTER_MINUTES+)
// - PENDING + stale lock while still pending (orphaned)
// - PROCESSING + stale heartbeat (crashed worker)
const JOB_CLAIM_WHERE = `
  (status = 'PENDING' AND (
    schedule_time IS NULL
    OR schedule_time <= NOW()
  ))
  OR (status = 'PENDING'
    AND locked_at IS NULL
    AND worker_id IS NULL
    AND schedule_time IS NOT NULL
    AND schedule_time <= NOW() - ${STUCK_INTERVAL})
  OR (status = 'PENDING'
    AND locked_at IS NOT NULL
    AND locked_at < NOW() - ${STUCK_INTERVAL})
  OR (status = 'PROCESSING'
    AND locked_at < NOW() - ${STUCK_INTERVAL})
`;
// How many files can be PROCESSING at once. This does NOT control HTTP
// concurrency (job-budget-manager.js does that) — it just caps how many
// files' streams are open at a time. Set >=2 so jobs scheduled minutes
// apart (like your 10:00pm / 10:10pm files) can run concurrently and
// share the budget instead of queueing behind each other.
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS) || 5;
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== "false";

let runningJobs = 0;

async function releaseJob(jobId) {
  // Put back to PENDING so a worker that actually has the file can claim it.
  await queryWithRetry(
    `UPDATE file_entity
     SET status = 'PENDING', locked_at = NULL, worker_id = NULL
     WHERE id = ? AND status = 'PROCESSING'`,
    [jobId],
  );
}

async function claimNextJob() {
  // Pick due PENDING jobs, stuck PENDING jobs (never locked / stale lock),
  // or PROCESSING jobs whose last checkpoint is stale (worker crashed mid-job).
  console.log("claim next job");
  const [candidates] = await queryWithRetry(`
    SELECT id, file_path, file_name FROM file_entity
    WHERE ${JOB_CLAIM_WHERE}
    ORDER BY id ASC
    LIMIT 10
  `);
  console.log("candidates ==", candidates);
  if (candidates.length === 0) {
    console.log("no candidates");
    const [[stats]] = await queryWithRetry(`
      SELECT
        SUM(status = 'PENDING' AND (schedule_time IS NULL OR schedule_time <= NOW())) AS due,
        SUM(status = 'PENDING'
          AND locked_at IS NULL
          AND worker_id IS NULL
          AND schedule_time IS NOT NULL
          AND schedule_time <= NOW() - ${STUCK_INTERVAL}) AS stuck_pending,
        SUM(status = 'PENDING' AND schedule_time > NOW()) AS waiting,
        SUM(status = 'PROCESSING') AS processing,
        SUM(status = 'FAILED') AS failed
      FROM file_entity
    `);
    console.log("no candidates —", stats);
    return null;
  }

  for (const candidate of candidates) {
    const filePath = candidate.file_path || candidate.file_name;
    // Another host may share this DB but not this disk (e.g. debian vs Windows).
    // Skip without claiming — do NOT mark FAILED.
    if (!filePath || !fs.existsSync(filePath)) {
      console.log(
        `⏭️  Skip job ${candidate.id} — file not on this host (${WORKER_ID}): ${filePath}`,
      );
      continue;
    }

    const [result] = await queryWithRetry(
      `
      UPDATE file_entity
      SET status = 'PROCESSING', locked_at = NOW(), worker_id = ?
      WHERE id = ?
        AND (${JOB_CLAIM_WHERE})
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
    console.error(`❌ Job failed ${job.id}:`, err);
    if (err.message?.startsWith("File not found")) {
      // Likely claimed on the wrong host — release so the machine with the
      // file can pick it up. Do not permanently FAILED.
      console.warn(
        `♻️  Releasing job ${job.id} back to PENDING (file missing on ${WORKER_ID})`,
      );
      await releaseJob(job.id);
    }
  } finally {
    clearInterval(heartbeat);
    runningJobs--;
  }
}

if (!SCHEDULER_ENABLED) {
  console.log("⏸️ File scheduler disabled (SCHEDULER_ENABLED=false)");
} else {
  console.log(`👷 File scheduler worker: ${WORKER_ID}`);
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
        console.log("— nothing to do —",job);
        return;
      }
      // fire and forget so the cron tick isn't blocked for the whole job duration
      runJob(job);
    } catch (err) {
      console.error("❌ Cron tick error:", err.message);
    }
  });
}
