const express = require("express");
const db = require("./config/connection");
require("./services/scheduler");
const { sendResponse } = require("./lib/api-response");
const fileRoutes = require("./routes/file-routes");
const dashboardRoutes = require("./routes/dashboard-routes");
const centerRoutes = require("./routes/center-routes");
const serviceRoutes = require("./routes/services-routes");
const userRoutes = require("./routes/user-routes");
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

app.get("/", (req, res) => {
  res.send("Leadset Generation API is running!");
});
app.use("/api/files", fileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/centers", centerRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/users", userRoutes);
app.use((req, res) => {
  return sendResponse({
    res,
    success: false,
    statusCode: 404,
    message: `Route not Found : ${req.originalUrl}`,
  });
});

async function startServer() {
  try {
    const connection = await db.getConnection();

    console.log("✅ MySQL Connected");

    connection.release();

    app.listen(PORT, () => {
      console.log(`🌐 Server running on  http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Database Connection Failed");
    console.error(error);
    process.exit(1);
  }
}
startServer();
