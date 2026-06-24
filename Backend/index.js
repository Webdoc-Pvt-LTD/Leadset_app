const express = require("express");
const fileRoutes = require("./routes/file-routes");
const db = require("./config/connection");
require("./services/scheduler");
const { sendResponse } = require("./lib/api-response");
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Leadset Generation API is running!");
});
app.use("/api/files", fileRoutes);

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
