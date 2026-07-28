const cron = require("node-cron");

const { createBatchesForAllServices } = require("./auto-batch");



// Set AUTO_BATCH_ENABLED=false to disable.

const ENABLED = process.env.AUTO_BATCH_ENABLED !== "false";

// Default: once daily at 16:10. Override with AUTO_BATCH_CRON (node-cron syntax).
const CRON_EXPR = process.env.AUTO_BATCH_CRON || "10 16 * * *";



let running = false;



async function runAutoBatchTick() {

  if (!ENABLED) return;

  if (running) {

    console.log("⏳ Auto-batch already running, skipping tick");

    return;

  }



  running = true;

  console.log(

    "📦 Auto-batch cron: creating one file per active service (batch_size + schedule_time from services)...",

  );



  try {

    const batches = await createBatchesForAllServices();



    if (!batches.length) {

      console.log("— auto-batch: no files created —");

      return;

    }



    for (const batch of batches) {

      console.log(

        `✅ Auto-batch created file_entity #${batch.file_entity_id} ` +

          `(${batch.service}, ${batch.total_record} records, ` +

          `scheduled ${batch.schedule_time}, ${batch.file_name})`,

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

      `📅 Auto-batch cron scheduled (${CRON_EXPR}) — one file per service per tick`,

    );

  }

} else {

  console.log("⏸️ Auto-batch cron disabled (AUTO_BATCH_ENABLED=false)");

}



module.exports = { runAutoBatchTick };


