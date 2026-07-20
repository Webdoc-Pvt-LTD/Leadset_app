const cron = require("node-cron");
const { createBatch, DEFAULT_BATCH_SIZE } = require("./auto-batch");

// Set AUTO_BATCH_ENABLED=false to disable.
const ENABLED = process.env.AUTO_BATCH_ENABLED !== "false";
// Default: every hour at minute 0. Override with AUTO_BATCH_CRON (node-cron syntax).
const CRON_EXPR = process.env.AUTO_BATCH_CRON || "0 * * * *";
const BATCH_SIZE = Number(process.env.AUTO_BATCH_SIZE) || DEFAULT_BATCH_SIZE;

let running = false;

async function runAutoBatchTick() {
  if (!ENABLED) return;
  if (running) {
    console.log("⏳ Auto-batch already running, skipping tick");
    return;
  }

  running = true;
  console.log("📦 Auto-batch cron: generating next MSISDN file...");

  try {
    const batch = await createBatch({
      batchSize: BATCH_SIZE,
      scheduleTime: null, // due immediately → existing job cron will pick it up
    });

    console.log(
      `✅ Auto-batch created file_entity #${batch.file_entity_id} ` +
        `(${batch.service}, ${batch.total_record} records, ${batch.file_name})`,
    );
  } catch (err) {
    if (String(err.message || "").includes("No available MSISDNs")) {
      console.log("— auto-batch: msisdn_list exhausted —");
    } else {
      console.error("❌ Auto-batch cron error:", err.message);
    }
  } finally {
    running = false;
  }
}

if (ENABLED) {
  if (!cron.validate(CRON_EXPR)) {
    console.error(`❌ Invalid AUTO_BATCH_CRON: ${CRON_EXPR}`);
  } else {
    cron.schedule(CRON_EXPR, () => {
      runAutoBatchTick();
    });
    console.log(
      `📅 Auto-batch cron scheduled (${CRON_EXPR}), batch_size=${BATCH_SIZE}`,
    );
  }
} else {
  console.log("⏸️ Auto-batch cron disabled (AUTO_BATCH_ENABLED=false)");
}

module.exports = { runAutoBatchTick };
