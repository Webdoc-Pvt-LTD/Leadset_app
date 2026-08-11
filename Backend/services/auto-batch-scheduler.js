const cron = require("node-cron");

const { createBatchesForDueSchedules } = require("./auto-batch");

// Set AUTO_BATCH_ENABLED=false to disable.
const ENABLED = process.env.AUTO_BATCH_ENABLED !== "false";

// Runs every minute; each service_file_schedules row fires at its generate_time.
const CRON_EXPR = process.env.AUTO_BATCH_CRON || "* * * * *";

let running = false;

async function runAutoBatchTick() {
  if (!ENABLED) return;

  if (running) {
    console.log("⏳ Auto-batch already running, skipping tick");
    return;
  }

  running = true;

  try {
    const batches = await createBatchesForDueSchedules();

    if (!batches.length) {
      return;
    }

    console.log(
      `📦 Auto-batch: ${batches.length} file(s) created from due schedule slot(s)`,
    );

    for (const batch of batches) {
      console.log(
        `✅ file_entity #${batch.file_entity_id} (${batch.service}, ` +
          `${batch.total_record} records, generate ${batch.generate_time}, ` +
          `process ${batch.schedule_time}, ${batch.file_name})`,
      );
    }
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
      `📅 Auto-batch cron scheduled (${CRON_EXPR}) — per-slot generate_time from service_file_schedules`,
    );
  }
} else {
  console.log("⏸️ Auto-batch cron disabled (AUTO_BATCH_ENABLED=false)");
}

module.exports = { runAutoBatchTick };
