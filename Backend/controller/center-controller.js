const db = require("../config/connection");
const { sendResponse } = require("../lib/api-response");
const getCenters = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        name
      FROM centers
      ORDER BY id DESC
    `;

    const [rows] = await db.query(query);

    return sendResponse({
      res,
      success: true,
      message: "Centers fetched successfully",
      statusCode: 200,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching centers:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch centers",
      statusCode: 500,
      error: error.message,
    });
  }
};
const getCenterServices = async (req, res) => {
  try {
    const { center_id } = req.params;

    const query = `
      SELECT
        id,
        name,
        center_id
      FROM services
      WHERE center_id = ?
      ORDER BY id DESC
    `;

    const [rows] = await db.query(query, [center_id]);

    return sendResponse({
      res,
      success: true,
      message: "Services fetched successfully",
      statusCode: 200,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching center services:", error);

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
  getCenters,
  getCenterServices,
};
