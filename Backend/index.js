const express = require("express");
const db = require("./config/connection");
const { isRetryable, sleep } = require("./utils/db-retry");
require("./services/scheduler");
require("./services/auto-batch-scheduler");
const { sendResponse } = require("./lib/api-response");
const fileRoutes = require("./routes/file-routes");
const dashboardRoutes = require("./routes/dashboard-routes");
const centerRoutes = require("./routes/center-routes");
const serviceRoutes = require("./routes/services-routes");
const userRoutes = require("./routes/user-routes");
const autoBatchRoutes = require("./routes/auto-batch-routes");
const app = express();
const cors = require("cors");

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
const PORT = process.env.PORT || 5000;
const DB_CONNECT_MAX_RETRIES = Number(process.env.DB_CONNECT_MAX_RETRIES) || 10;
const DB_CONNECT_BASE_DELAY_MS =
  Number(process.env.DB_CONNECT_BASE_DELAY_MS) || 2000;

app.get("/", (req, res) => {
  res.send("Leadset Generation API is running!");
});
app.use("/api/files", fileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/centers", centerRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auto", autoBatchRoutes);
app.use((req, res) => {
  return sendResponse({
    res,
    success: false,
    statusCode: 404,
    message: `Route not Found : ${req.originalUrl}`,
  });
});

async function waitForDatabase() {
  let attempt = 0;

  while (true) {
    try {
      const connection = await db.getConnection();
      connection.release();
      console.log("✅ MySQL Connected");
      return;
    } catch (error) {
      attempt++;
      const canRetry = isRetryable(error) && attempt <= DB_CONNECT_MAX_RETRIES;

      if (!canRetry) {
        throw error;
      }

      const delay = DB_CONNECT_BASE_DELAY_MS * Math.min(attempt, 5);
      console.warn(
        `⚠️ MySQL connect failed (${error.code || error.message}), ` +
          `retry ${attempt}/${DB_CONNECT_MAX_RETRIES} in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
}

async function startServer() {
  try {
    await waitForDatabase();

    app.listen(PORT, () => {
      console.log(`🌐 Server running on  http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Database Connection Failed after retries");
    console.error(error);
    process.exit(1);
  }
}
startServer();
