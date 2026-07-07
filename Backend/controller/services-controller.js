const db = require("../config/connection");
const { sendResponse } = require("../lib/api-response");

const getServices = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        name
      FROM services
      WHERE active = TRUE
      ORDER BY id DESC
    `;

    const [rows] = await db.query(query);

    return sendResponse({
      res,
      success: true,
      message: "Services fetched successfully",
      statusCode: 200,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching services:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch services",
      statusCode: 500,
      error: error.message,
    });
  }
};
module.exports = {
  getServices,
};
