// db.js or dbConfig.js
import mysql from "mysql2/promise";

const baseConfig = {
  host: "192.168.15.191",
  user: "webreport",
  password: "webreport",
  waitForConnections: true,
  connectionLimit: 10,
};

// Pool for each database
export const dbPools = {
  HIS: mysql.createPool({ ...baseConfig, database: "HIS" }),
  HBS: mysql.createPool({ ...baseConfig, database: "HBS" }),
  MIS: mysql.createPool({ ...baseConfig, database: "MIS" }),
};

// Helper to get the right pool
export const getPoolByService = (service) => {
  const pool = dbPools[service?.toUpperCase()];
  if (!pool) throw new Error(`Unknown service: ${service}`);
  return pool;
};
