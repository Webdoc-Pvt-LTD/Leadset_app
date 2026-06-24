const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
});
pool.on("connection", (conn) => {
  conn.on("error", (err) => {
    console.error("⚠️ MySQL connection error:", err.code);
  });
});
module.exports = pool;
