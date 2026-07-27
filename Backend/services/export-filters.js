const DEFAULT_BATCH_SIZE = 1000;

function normalizeMsisdn(msisdn) {
  return String(msisdn || "").replace(/^0+/, "").trim();
}

async function dncTableExists(db) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'dnc_list' LIMIT 1`,
  );
  return rows.length > 0;
}

async function loadDncSet(db, msisdnList, batchSize = DEFAULT_BATCH_SIZE) {
  const dncSet = new Set();
  if (!msisdnList.length) return dncSet;

  if (!(await dncTableExists(db))) {
    console.warn("⚠️ dnc_list table not found, skipping DNC filter");
    return dncSet;
  }

  for (let i = 0; i < msisdnList.length; i += batchSize) {
    const batch = msisdnList.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(", ");

    const [rows] = await db.query(
      `SELECT msisdn FROM dnc_list WHERE msisdn IN (${placeholders})`,
      batch.map(normalizeMsisdn),
    );

    rows.forEach((row) => {
      dncSet.add(normalizeMsisdn(row.msisdn));
    });
  }

  return dncSet;
}

/**
 * Apply export filters in order:
 * 1. DNC list (dnc_list)
 * 2. Active subscribers (remove_sub)
 * 3. Recent unsubs (remove_unsub)
 */
async function applyExportFilters({
  responseRows,
  db,
  servicePool,
  removeSub = false,
  removeUnsub = false,
  unsubDays = 0,
  batchSize = DEFAULT_BATCH_SIZE,
}) {
  const msisdnList = responseRows.map((r) => String(r.msisdn));

  console.log("Applying DNC filter...");
  const dncSet = await loadDncSet(db, msisdnList, batchSize);
  const afterDnc = responseRows.filter(
    (row) => !dncSet.has(normalizeMsisdn(row.msisdn)),
  );
  const dncRemovedCount = responseRows.length - afterDnc.length;
  console.log(`DNC numbers removed: ${dncRemovedCount}`);

  const afterDncMsisdnList = afterDnc.map((r) => String(r.msisdn));
  const subscriberSet = new Set();

  if (removeSub) {
    console.log("Applying remove_sub filter...");

    for (let i = 0; i < afterDncMsisdnList.length; i += batchSize) {
      const batch = afterDncMsisdnList.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(", ");

      const [subRows] = await servicePool.query(
        `SELECT cellno FROM subscriber
         WHERE cellno IN (${placeholders})
           AND unsub_dt IS NULL`,
        batch,
      );

      subRows.forEach((row) => {
        subscriberSet.add(normalizeMsisdn(row.cellno));
      });
    }

    console.log(`Active subscribers to remove: ${subscriberSet.size}`);
  }

  const unsubSet = new Set();

  if (removeUnsub) {
    const days = Number(unsubDays);
    console.log(`Applying remove_unsub filter for last ${days} days...`);

    for (let i = 0; i < afterDncMsisdnList.length; i += batchSize) {
      const batch = afterDncMsisdnList.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(", ");

      const [unsubRows] = await servicePool.query(
        `SELECT cellno FROM subscriber_unsub
         WHERE cellno IN (${placeholders})
           AND unsub_dt >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [...batch, days],
      );

      unsubRows.forEach((row) => {
        unsubSet.add(normalizeMsisdn(row.cellno));
      });
    }

    console.log(`Recently unsubscribed to remove: ${unsubSet.size}`);
  }

  const filteredRows = afterDnc.filter((row) => {
    const msisdn = normalizeMsisdn(row.msisdn);
    if (subscriberSet.has(msisdn)) return false;
    if (unsubSet.has(msisdn)) return false;
    return true;
  });

  console.log(`Remaining records after all filters: ${filteredRows.length}`);

  return {
    filteredRows,
    dncRemovedCount,
    afterDncCount: afterDnc.length,
    subscriberSet,
    unsubSet,
  };
}

module.exports = {
  normalizeMsisdn,
  applyExportFilters,
};
