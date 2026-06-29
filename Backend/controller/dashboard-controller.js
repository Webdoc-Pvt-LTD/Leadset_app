const db = require("../config/connection");
const { sendResponse } = require("../lib/api-response");

const dashboardData = async (req, res) => {
  try {
    // SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) AS inprogress,
    const query = `
      SELECT
        COUNT(*) AS totalFiles,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedFiles,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingFiles
      FROM file_entity;
    `;

    const [rows] = await db.query(query);

    return sendResponse({
      res,
      success: true,
      message: "Dashboard stats fetched successfully",
      data: rows[0],
      statusCode: 200,
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch dashboard stats",
      statusCode: 500,
      error: error.message,
    });
  }
};

module.exports = {
  dashboardData,
};
