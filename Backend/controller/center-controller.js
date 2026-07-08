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
const updateCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;

    // Validation
    if (!name) {
      return sendResponse({
        res,
        success: false,
        message: "Center name is required",
        statusCode: 400,
      });
    }

    if (typeof is_active === "undefined") {
      return sendResponse({
        res,
        success: false,
        message: "Center status is required",
        statusCode: 400,
      });
    }

    // Check if center exists
    const [center] = await db.query(`SELECT id FROM centers WHERE id = ?`, [
      id,
    ]);

    if (center.length === 0) {
      return sendResponse({
        res,
        success: false,
        message: "Center not found",
        statusCode: 404,
      });
    }

    // Check duplicate name (excluding current center)
    const [existingCenter] = await db.query(
      `SELECT id FROM centers WHERE name = ? AND id != ?`,
      [name, id],
    );

    if (existingCenter.length > 0) {
      return sendResponse({
        res,
        success: false,
        message: "Center already exists",
        statusCode: 409,
      });
    }

    // Update center
    await db.query(
      `
        UPDATE centers
        SET
          name = ?,
          is_active = ?
        WHERE id = ?
      `,
      [name, is_active ? 1 : 0, id],
    );

    return sendResponse({
      res,
      success: true,
      message: "Center updated successfully",
      statusCode: 200,
      data: {
        id: Number(id),
        name,
        is_active: is_active ? 1 : 0,
      },
    });
  } catch (error) {
    console.error("Error updating center:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to update center",
      statusCode: 500,
      error: error.message,
    });
  }
};

const assignServiceToCenter = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { service_id, assignments } = req.body;

    // `assignments` must be an array. An EMPTY array is valid — it means
    // "unassign every center from this service" (user removed all rows in UI).
    if (!service_id || !Array.isArray(assignments)) {
      return sendResponse({
        res,
        success: false,
        message: "Invalid payload",
        statusCode: 400,
      });
    }

    await connection.beginTransaction();

    /*
      Case: user removed every center for this service.
      Just wipe existing rows and return early.
    */
    if (assignments.length === 0) {
      await connection.query(
        `DELETE FROM center_service_assignment WHERE service_id = ?`,
        [service_id],
      );

      await connection.commit();

      return sendResponse({
        res,
        success: true,
        message: "All center allocations removed for this service",
        statusCode: 200,
        data: { total_assigned: 0, remaining: 100 },
      });
    }

    /*
      Validate each row: center_id present, percentage_quota a valid
      number between 0-100, and no duplicate center_id in the payload.
    */
    const seenCenters = new Set();

    for (const item of assignments) {
      const { center_id, percentage_quota } = item;

      if (
        !center_id ||
        percentage_quota === undefined ||
        percentage_quota === null ||
        percentage_quota === ""
      ) {
        await connection.rollback();

        return sendResponse({
          res,
          success: false,
          message: "Invalid assignment data",
          statusCode: 400,
        });
      }

      const quotaNum = Number(percentage_quota);

      if (Number.isNaN(quotaNum) || quotaNum < 0 || quotaNum > 100) {
        await connection.rollback();

        return sendResponse({
          res,
          success: false,
          message: `Invalid quota value for center ${center_id}`,
          statusCode: 400,
        });
      }

      const centerKey = Number(center_id);

      if (seenCenters.has(centerKey)) {
        await connection.rollback();

        return sendResponse({
          res,
          success: false,
          message: "Duplicate center in assignment list",
          statusCode: 400,
        });
      }

      seenCenters.add(centerKey);
    }

    /*
      Check total service quota from payload
    */

    const requestTotal = assignments.reduce(
      (sum, item) => sum + Number(item.percentage_quota || 0),
      0,
    );

    const roundedTotal = Number(requestTotal.toFixed(2));

    if (roundedTotal > 100) {
      await connection.rollback();

      return sendResponse({
        res,
        success: false,
        message: `Total quota cannot exceed 100%. You are trying to assign ${roundedTotal}%`,
        statusCode: 400,
      });
    }

    /*
      Check existing quota of this service, excluding centers
      coming in the payload. In the normal flow this will be 0,
      since the UI always sends the FULL current assignment list
      for the service — this is a safety net against race conditions
      (e.g. two admins editing the same service at once).
    */

    const centerIds = assignments.map((item) => item.center_id);

    const placeholders = centerIds.map(() => "?").join(",");

    const [existingQuota] = await connection.query(
      `
      SELECT 
        COALESCE(SUM(percentage_quota),0) AS total_quota

      FROM center_service_assignment

      WHERE service_id = ?

      AND center_id NOT IN (${placeholders})
      `,
      [service_id, ...centerIds],
    );

    const alreadyAssigned = Number(existingQuota[0].total_quota || 0);

    const finalQuota = Number((alreadyAssigned + roundedTotal).toFixed(2));

    if (finalQuota > 100) {
      await connection.rollback();

      return sendResponse({
        res,
        success: false,
        message: `Service quota exceeded. Other centers already hold ${alreadyAssigned}%, leaving only ${(100 - alreadyAssigned).toFixed(2)}% available.`,
        statusCode: 400,
      });
    }

    /*
      Remove rows for centers that used to be assigned to this service
      but are no longer present in the incoming payload (user hit
      "Remove" in the UI). Without this step, those rows stay in the
      table forever and keep silently eating into the 100% quota.
    */

    await connection.query(
      `
      DELETE FROM center_service_assignment

      WHERE service_id = ?

      AND center_id NOT IN (${placeholders})
      `,
      [service_id, ...centerIds],
    );

    /*
      Insert / Update assignments
    */

    for (const item of assignments) {
      const { center_id, percentage_quota, poc_email, cc_email } = item;

      const [existing] = await connection.query(
        `
        SELECT id

        FROM center_service_assignment

        WHERE service_id=?
        AND center_id=?
        `,
        [service_id, center_id],
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
            service_id,
            center_id,
            percentage_quota,
            poc_email,
            cc_email
          )

          VALUES(?,?,?,?,?)
          `,
          [
            service_id,
            center_id,
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
      message: "Service center allocation saved successfully",
      statusCode: 200,
      data: {
        total_assigned: roundedTotal,
        remaining: Number((100 - roundedTotal).toFixed(2)),
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("assign service center error:", error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to save allocation",
      statusCode: 500,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = { assignServiceToCenter };

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
  updateCenter,
};
