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

// const assignServiceToCenter = async (req, res) => {
//   try {
//     const { center_id, service_id, percentage_quota, poc_email, cc_email } =
//       req.body;

//     if (!center_id || !service_id || !percentage_quota || !poc_email) {
//       return sendResponse({
//         res,
//         success: false,
//         message: "Required fields missing",
//         statusCode: 400,
//       });
//     }

//     // Check existing assignment
//     const [existing] = await db.query(
//       `
//       SELECT id
//       FROM center_service_assignment
//       WHERE center_id = ?
//       AND service_id = ?
//       `,
//       [center_id, service_id],
//     );

//     if (existing.length > 0) {
//       await db.query(
//         `
//         UPDATE center_service_assignment
//         SET
//           percentage_quota=?,
//           poc_email=?,
//           cc_email=?
//         WHERE id=?
//         `,
//         [percentage_quota, poc_email, cc_email || null, existing[0].id],
//       );

//       return sendResponse({
//         res,
//         success: true,
//         message: "Assignment updated successfully",
//         statusCode: 200,
//       });
//     }

//     const [result] = await db.query(
//       `
//       INSERT INTO center_service_assignment
//       (
//         center_id,
//         service_id,
//         percentage_quota,
//         poc_email,
//         cc_email
//       )
//       VALUES (?,?,?,?,?)
//       `,
//       [center_id, service_id, percentage_quota, poc_email, cc_email || null],
//     );

//     return sendResponse({
//       res,
//       success: true,
//       message: "Service assigned successfully",
//       statusCode: 201,
//       data: {
//         id: result.insertId,
//       },
//     });
//   } catch (error) {
//     console.error(error);

//     return sendResponse({
//       res,
//       success: false,
//       message: "Failed to assign service",
//       statusCode: 500,
//       error: error.message,
//     });
//   }
// };

const assignServiceToCenter = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { center_id, assignments } = req.body;

    if (!center_id || !assignments?.length) {
      return sendResponse({
        res,
        success: false,
        message: "Invalid payload",
        statusCode: 400,
      });
    }

    const totalQuota = assignments.reduce(
      (sum, item) => sum + Number(item.percentage_quota || 0),
      0,
    );

    if (totalQuota > 100) {
      return sendResponse({
        res,
        success: false,
        message: "Total quota cannot exceed 100%",
        statusCode: 400,
      });
    }

    await connection.beginTransaction();

    for (const item of assignments) {
      const { service_id, percentage_quota, poc_email, cc_email } = item;

      const [existing] = await connection.query(
        `
        SELECT id
        FROM center_service_assignment
        WHERE center_id=?
        AND service_id=?
        `,
        [center_id, service_id],
      );

      if (existing.length) {
        await connection.query(
          `
          UPDATE center_service_assignment
          SET
            percentage_quota=?,
            poc_email=?,
            cc_email=?
          WHERE id=?
          `,
          [percentage_quota, poc_email, cc_email || null, existing[0].id],
        );
      } else {
        await connection.query(
          `
          INSERT INTO center_service_assignment
          (
            center_id,
            service_id,
            percentage_quota,
            poc_email,
            cc_email
          )
          VALUES(?,?,?,?,?)
          `,
          [
            center_id,
            service_id,
            percentage_quota,
            poc_email,
            cc_email || null,
          ],
        );
      }
    }

    await connection.commit();

    return sendResponse({
      res,
      success: true,
      message: "Assignments saved successfully",
      statusCode: 200,
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to save assignments",
      statusCode: 500,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const getCenterAssignments = async (req, res) => {
  try {
    const { center_id } = req.params;

    if (!center_id) {
      return sendResponse({
        res,
        success: false,
        message: "Center id is required",
        statusCode: 400,
      });
    }

    const query = `
      SELECT
        csa.id,
        csa.center_id,
        csa.service_id,
        s.name AS service_name,
        csa.percentage_quota,
        csa.poc_email,
        csa.cc_email
      FROM center_service_assignment csa
      INNER JOIN services s
        ON s.id = csa.service_id
      WHERE csa.center_id = ?
      ORDER BY csa.id DESC
    `;

    const [rows] = await db.query(query, [center_id]);

    return sendResponse({
      res,
      success: true,
      message: "Center assignments fetched successfully",
      statusCode: 200,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching center assignments:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch assignments",
      statusCode: 500,
      error: error.message,
    });
  }
};
module.exports = {
  getCenters,
  createCenter,
  assignServiceToCenter,
  getCenterAssignments,
};
