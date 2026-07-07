const db = require("../config/connection");
const { sendResponse } = require("../lib/api-response");
const getCenters = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        name,
        is_active
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
const createCenter = async (req, res) => {
  try {
    const { name } = req.body;

    // Validation
    if (!name) {
      return sendResponse({
        res,
        success: false,
        message: "Center name is required",
        statusCode: 400,
      });
    }

    // Check duplicate center
    const [existingCenter] = await db.query(
      `SELECT id FROM centers WHERE name = ?`,
      [name],
    );

    if (existingCenter.length > 0) {
      return sendResponse({
        res,
        success: false,
        message: "Center already exists",
        statusCode: 409,
      });
    }

    // Insert center
    const query = `
      INSERT INTO centers
      (
        name,
        is_active
      )
      VALUES (?, ?)
    `;

    const [result] = await db.query(query, [name, 1]);

    return sendResponse({
      res,
      success: true,
      message: "Center created successfully",
      statusCode: 201,
      data: {
        id: result.insertId,
        name,
        is_active: 1,
      },
    });
  } catch (error) {
    console.error("Error creating center:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to create center",
      statusCode: 500,
      error: error.message,
    });
  }
};

module.exports = {
  getCenters,
  createCenter,
};
