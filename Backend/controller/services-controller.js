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
const getServiceQuota = async (req, res) => {
  try {
    const { service_id } = req.params;

    if (!service_id) {
      return sendResponse({
        res,
        success: false,
        message: "Service id is required",
        statusCode: 400,
      });
    }

    const query = `
      SELECT
        csa.id,
        csa.service_id,
        s.name AS service_name,

        csa.center_id,
        c.name AS center_name,

        csa.percentage_quota,

        csa.poc_email,
        csa.cc_email

      FROM center_service_assignment csa

      INNER JOIN services s
        ON s.id = csa.service_id

      INNER JOIN centers c
        ON c.id = csa.center_id

      WHERE csa.service_id = ?

      ORDER BY csa.id DESC
    `;

    const [rows] = await db.query(query, [service_id]);

    const assignedQuota = rows.reduce(
      (sum, item) => sum + Number(item.percentage_quota),
      0,
    );

    return sendResponse({
      res,

      success: true,

      message: "Service quota fetched successfully",

      statusCode: 200,

      data: {
        service_id: Number(service_id),

        service_name: rows.length ? rows[0].service_name : null,

        assigned_quota: Number(assignedQuota.toFixed(2)),

        remaining_quota: Number((100 - assignedQuota).toFixed(2)),

        centers: rows.map((item) => ({
          id: item.id,

          center_id: item.center_id,

          center_name: item.center_name,

          percentage_quota: item.percentage_quota,

          poc_email: item.poc_email,

          cc_email: item.cc_email,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching service quota:", error);

    return sendResponse({
      res,

      success: false,

      message: "Failed to fetch service quota",

      statusCode: 500,

      error: error.message,
    });
  }
};
module.exports = {
  getServices,
  getServiceQuota,
};
