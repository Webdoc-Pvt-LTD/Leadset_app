/**
 * Run: node scripts/run-migration.js
 * Applies Backend/migrations/001_service_file_schedules.sql
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const MIGRATION_FILE = path.join(
  __dirname,
  "../migrations/001_service_file_schedules.sql",
);

const IGNORABLE_ERRORS = new Set([
  "ER_DUP_FIELDNAME", // schedule_id already exists
  "ER_DUP_KEYNAME", // index already exists
]);

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

async function run() {
  const sql = fs.readFileSync(MIGRATION_FILE, "utf8");
  const statements = splitSqlStatements(sql);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  console.log(`📦 Running migration on ${process.env.DB_NAME}...`);

  try {
    for (const statement of statements) {
      const preview = statement.replace(/\s+/g, " ").slice(0, 80);
      try {
        await connection.query(statement);
        console.log(`✅ ${preview}...`);
      } catch (err) {
        if (IGNORABLE_ERRORS.has(err.code)) {
          console.log(`⏭️  Skipped (already applied): ${preview}...`);
          continue;
        }
        throw err;
      }
    }

    console.log("✅ Migration completed successfully.");
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
