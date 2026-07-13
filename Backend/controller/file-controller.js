const db = require("../config/connection");
const { sendResponse } = require("../lib/api-response");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const { getPoolByService } = require("../config/subscriber-connection");
const streamPool = require("../config/pool-connection");
const { sendMail } = require("../services/mailer");

const countFileRecords = (filePath) => {
  return new Promise((resolve, reject) => {
    let count = 0;
    let buffer = "";

    const stream = fs.createReadStream(filePath, {
      encoding: "utf8",
    });

    stream.on("data", (chunk) => {
      buffer += chunk;

      let lines = buffer.split("\n");
      buffer = lines.pop();

      for (let line of lines) {
        if (line.trim()) count++;
      }
    });

    stream.on("end", () => {
      if (buffer.trim()) count++;
      resolve(count);
    });

    stream.on("error", reject);
  });
};
const uploadFile = async (req, res) => {
  try {
    const {
      jobName,
      scheduleTime,
      balance_limit,
      service,
      remove_sub,
      remove_unsub,
      days,
    } = req.body;

    if (!req.file) {
      return sendResponse({
        res,
        success: false,
        message: "File is required",
        statusCode: 400,
      });
    }
    if (!balance_limit || !service) {
      return sendResponse({
        res,
        success: false,
        message: "service && balance limit required",
        statusCode: 400,
      });
    }
    const finalDays = remove_unsub ? days : 0;
    const filePath = path.resolve(req.file.path);
    const fileName = req.file.originalname;
    const total_record = await countFileRecords(filePath);

    // ⏰ schedule validation
    // if (scheduleTime) {
    //   const scheduleDate = new Date(scheduleTime);
    //   const now = new Date();

    //   if (isNaN(scheduleDate.getTime())) {
    //     return sendResponse({
    //       res,
    //       success: false,
    //       message: "Invalid scheduleTime format",
    //       statusCode: 400,
    //     });
    //   }

    //   if (scheduleDate <= now) {
    //     return sendResponse({
    //       res,
    //       success: false,
    //       message: "scheduleTime must be greater than current time",
    //       statusCode: 400,
    //     });
    //   }
    // }
    const balanceLimitDecimal =
      balance_limit !== undefined && balance_limit !== null
        ? parseFloat(balance_limit)
        : null;
    const [insertResult] = await db.query(
      `
  INSERT INTO file_entity
  (
    file_name,
    file_path,
    job_name,
    schedule_time,
    total_record,
    balance_limit,
    service,
    remove_sub,
    remove_unsub,
    days,
    upload_date,
    status
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'PENDING')
  `,
      [
        fileName,
        filePath,
        jobName || null,
        scheduleTime || null,
        total_record,
        balanceLimitDecimal,
        service || null,
        remove_sub ? 1 : 0,
        remove_unsub ? 1 : 0,
        finalDays,
      ],
    );

    return sendResponse({
      res,
      success: true,
      message: "File uploaded successfully",
      statusCode: 200,
      data: {
        id: insertResult.insertId,
        fileName,
        filePath,
      },
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to upload file",
      statusCode: 500,
      error: error.message,
    });
  }
};
// const getFiles = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const offset = (page - 1) * limit;

//     // Total Records
//     const [[{ total }]] = await db.query(
//       `SELECT COUNT(*) AS total FROM file_entity`,
//     );

//     // Paginated Records
//     const [rows] = await db.query(
//       `
//       SELECT
//         id,
//         file_path,
//         file_name,
//         job_name,
//         processed_record,
//         response_table_name,
//         status,
//         total_record,
//         upload_date,
//         schedule_time,
//         job_start_date,
//         job_end_date,
//         balance_limit,
//         service,
//         remove_sub,
//         remove_unsub,
//         days
//       FROM file_entity
//       ORDER BY upload_date DESC
//       LIMIT ? OFFSET ?
//       `,
//       [limit, offset],
//     );

//     return sendResponse({
//       res,
//       success: true,
//       message: "Files fetched successfully",
//       statusCode: 200,
//       data: {
//         files: rows,
//         pagination: {
//           total,
//           page,
//           limit,
//           totalPages: Math.ceil(total / limit),
//         },
//       },
//     });
//   } catch (error) {
//     console.error(error);

//     return sendResponse({
//       res,
//       success: false,
//       message: "Failed to fetch files",
//       statusCode: 500,
//       error: error.message,
//     });
//   }
// };
const getFiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const status = (req.query.status || "all").trim().toUpperCase();

    let whereClause = "WHERE 1=1";
    const params = [];

    // Search filter
    if (search) {
      whereClause += ` AND (file_name LIKE ? OR job_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // Status filter
    if (status !== "ALL") {
      whereClause += ` AND status = ?`;
      params.push(status);
    }

    // Total count
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM file_entity
       ${whereClause}`,
      params,
    );

    // Data
    const [rows] = await db.query(
      `SELECT
    f.id,
    f.file_path,
    f.file_name,
    f.job_name,
    f.processed_record,
    f.response_table_name,
    f.status,
    f.total_record,
    f.upload_date,
    f.schedule_time,
    f.job_start_date,
    f.job_end_date,
    f.balance_limit,
    f.service,
    s.id AS service_id,
    f.remove_sub,
    f.remove_unsub,
    f.days
FROM file_entity f
LEFT JOIN services s
ON f.service COLLATE utf8mb4_0900_ai_ci = s.name
${whereClause}
ORDER BY f.upload_date DESC
LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return sendResponse({
      res,
      success: true,
      message: "Files fetched successfully",
      statusCode: 200,
      data: {
        files: rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to fetch files",
      statusCode: 500,
      error: error.message,
    });
  }
};
// const exportTableToExcel = async (req, res) => {
//   try {
//     const {
//       id,
//       unsub_days,
//       unsub_remove,
//       sub_remove,
//       send_email,
//       balance_limit,
//       service_id,
//     } = req.body;
//     console.log("Request body:", req.body);

//     if (!id || !balance_limit) {
//       return sendResponse({
//         res,
//         statusCode: 400,
//         success: false,
//         message: "Id and balance_limit are required!",
//       });
//     }
//     const query = `
//       SELECT
//         csa.id,
//         csa.service_id,
//         s.name AS service_name,

//         csa.center_id,
//         c.name AS center_name,

//         csa.percentage_quota,

//         csa.poc_email,
//         csa.cc_email

//       FROM center_service_assignment csa

//       INNER JOIN services s
//         ON s.id = csa.service_id

//       INNER JOIN centers c
//         ON c.id = csa.center_id

//       WHERE csa.service_id = ?

//       ORDER BY csa.id DESC
//     `;

//     const [serviceRows] = await db.query(query, [service_id]);
//     return sendResponse({
//       res,
//       statusCode: 200,
//       success: true,
//       data: serviceRows,
//     });
//     // 1. Fetch file metadata from main DB (including remove_sub, remove_unsub)
//     const [fileRows] = await db.execute(
//       `SELECT id, file_path, file_name, job_name, response_table_name,
//               status, balance_limit, service, remove_sub, remove_unsub
//        FROM file_entity
//        WHERE id = ? AND status = ?`,
//       [id, "COMPLETED"],
//     );

//     const uploadedFile = fileRows[0];

//     if (!uploadedFile) {
//       return sendResponse({
//         res,
//         statusCode: 400,
//         success: false,
//         message: "File does not exist!",
//       });
//     }

//     // 2. Validate unsub_days if remove_unsub is true
//     if (unsub_remove) {
//       if (!unsub_days || isNaN(Number(unsub_days)) || Number(unsub_days) <= 0) {
//         return sendResponse({
//           res,
//           statusCode: 400,
//           success: false,
//           message:
//             "unsub_days query param is required and must be a positive number when remove_unsub is enabled",
//         });
//       }
//     }

//     // 3. Get the correct pool based on service (HIS / HBS / MIS)
//     let servicePool;
//     try {
//       servicePool = getPoolByService(uploadedFile.service);
//     } catch (err) {
//       return sendResponse({
//         res,
//         statusCode: 400,
//         success: false,
//         message: `Invalid service '${uploadedFile.service}'. Must be HIS, HBS, or MIS.`,
//       });
//     }

//     // 4. Check response table exists in main DB
//     const [tableExists] = await db.query(
//       `SELECT 1 FROM information_schema.tables
//        WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
//       [uploadedFile.response_table_name],
//     );

//     if (tableExists.length === 0) {
//       return sendResponse({
//         res,
//         statusCode: 404,
//         success: false,
//         message: `Table '${uploadedFile.response_table_name}' does not exist`,
//       });
//     }

//     // 5. Conditionally check subscriber / subscriber_unsub tables exist
//     if (sub_remove) {
//       const [subTableExists] = await servicePool.query(
//         `SELECT 1 FROM information_schema.tables
//          WHERE table_schema = DATABASE() AND table_name = 'subscriber' LIMIT 1`,
//       );
//       if (subTableExists.length === 0) {
//         return sendResponse({
//           res,
//           statusCode: 404,
//           success: false,
//           message: `'subscriber' table does not exist in ${uploadedFile.service} database`,
//         });
//       }
//     }

//     if (unsub_remove) {
//       const [unsubTableExists] = await servicePool.query(
//         `SELECT 1 FROM information_schema.tables
//          WHERE table_schema = DATABASE() AND table_name = 'subscriber_unsub' LIMIT 1`,
//       );
//       if (unsubTableExists.length === 0) {
//         return sendResponse({
//           res,
//           statusCode: 404,
//           success: false,
//           message: `'subscriber_unsub' table does not exist in ${uploadedFile.service} database`,
//         });
//       }
//     }

//     // 6. Fetch response table data filtered by balance limit
//     const balanceLimitInCents = Number(balance_limit) * 100;

//     console.log(
//       balanceLimitInCents,
//       `Fetching MSISDNs from response table: ${uploadedFile.response_table_name}`,
//     );

//     const [responseRows] = await db.query(
//       `SELECT msisdn, data->>'$.bal' AS balance
//        FROM \`${uploadedFile.response_table_name}\`
//        WHERE data->>'$.bal' IS NOT NULL
//          AND data->>'$.bal' != 'null'
//          AND data->>'$.bal' != ''
//          AND CAST(data->>'$.bal' AS SIGNED) >= ?`,
//       [balanceLimitInCents],
//     );

//     if (responseRows.length === 0) {
//       return sendResponse({
//         res,
//         statusCode: 200,
//         success: true,
//         message: "No records found matching the balance limit",
//       });
//     }

//     console.log(`Total MSISDNs from response table: ${responseRows.length}`);

//     const msisdnList = responseRows.map((r) => String(r.msisdn));
//     const BATCH_SIZE = 1000;

//     // ─────────────────────────────────────────────
//     // STEP 7: Filter active subscribers (remove_sub)
//     // ─────────────────────────────────────────────
//     const subscriberSet = new Set();

//     if (sub_remove) {
//       console.log("Applying remove_sub filter...");

//       for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
//         const batch = msisdnList.slice(i, i + BATCH_SIZE);
//         const placeholders = batch.map(() => "?").join(", ");

//         const [subRows] = await servicePool.query(
//           `SELECT cellno FROM subscriber
//            WHERE cellno IN (${placeholders})
//              AND unsub_dt IS NULL`, // active subscribers only
//           batch,
//         );

//         subRows.forEach((row) => {
//           subscriberSet.add(String(row.cellno).replace(/^0/, ""));
//         });
//       }

//       console.log(`Active subscribers to remove: ${subscriberSet.size}`);
//     }

//     // ─────────────────────────────────────────────
//     // STEP 8: Filter recently unsubscribed (remove_unsub)
//     // ─────────────────────────────────────────────
//     const unsubSet = new Set();

//     if (unsub_remove) {
//       const days = Number(unsub_days);
//       console.log(`Applying remove_unsub filter for last ${days} days...`);

//       for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
//         const batch = msisdnList.slice(i, i + BATCH_SIZE);
//         const placeholders = batch.map(() => "?").join(", ");

//         // Fetch records unsubscribed within the last N days
//         const [unsubRows] = await servicePool.query(
//           `SELECT cellno FROM subscriber_unsub
//            WHERE cellno IN (${placeholders})
//              AND unsub_dt >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
//           [...batch, days],
//         );

//         unsubRows.forEach((row) => {
//           unsubSet.add(String(row.cellno).replace(/^0/, ""));
//         });
//       }

//       console.log(`Recently unsubscribed to remove: ${unsubSet.size}`);
//     }

//     // ─────────────────────────────────────────────
//     // STEP 9: Apply both filters to response rows
//     // ─────────────────────────────────────────────
//     const filteredRows = responseRows.filter((row) => {
//       const msisdn = String(row.msisdn);
//       if (subscriberSet.has(msisdn)) return false; // remove active sub
//       if (unsubSet.has(msisdn)) return false; // remove recent unsub
//       return true;
//     });

//     console.log(`Remaining records after all filters: ${filteredRows.length}`);

//     if (filteredRows.length === 0) {
//       return sendResponse({
//         res,
//         statusCode: 200,
//         success: true,
//         message: "No records remaining after applying filters",
//       });
//     }

//     // ─────────────────────────────────────────────
//     // STEP 10: Build Excel in memory
//     // ─────────────────────────────────────────────
//     const workbook = new ExcelJS.Workbook();
//     const sheet = workbook.addWorksheet("data");

//     sheet.columns = [
//       { header: "Sr No", key: "srNo", width: 10 },
//       { header: "Msisdn", key: "msisdn", width: 20 },
//       { header: "Balance", key: "balance", width: 15 },
//     ];

//     sheet.getRow(1).font = { bold: true };

//     let serialNo = 1;
//     for (const row of filteredRows) {
//       sheet.addRow({
//         srNo: serialNo++,
//         msisdn: row.msisdn,
//         balance: row.balance ? Number(row.balance) / 100 : null,
//       });
//     }

//     const excelBuffer = await workbook.xlsx.writeBuffer();
//     const fileName = `${uploadedFile.service}_${uploadedFile.response_table_name}_export.xlsx`;

//     // ─────────────────────────────────────────────
//     // STEP 11: Send Email
//     // ─────────────────────────────────────────────
//     if (send_email) {
//       const email = "hamzabhatti021@gmail.com";
//       const mailResult = await sendMail({
//         to: email,
//         // cc: ccRecipients,
//         subject: `Export: ${uploadedFile.file_name} (${uploadedFile.service})`,
//         html: `
//           <p>Hi,</p>

//           <p>Please find attached the exported data for <strong>${uploadedFile.file_name}</strong>.</p>
//           <ul>
//             <li><strong>Service:</strong> ${uploadedFile.service}</li>
//             <li><strong>Balance Limit:</strong> ${balance_limit}</li>
//             <li><strong>Total After Balance Filter:</strong> ${responseRows.length}</li>
//             ${sub_remove ? `<li><strong>Active Subscribers Removed:</strong> ${subscriberSet.size}</li>` : ""}
//             ${unsub_remove ? `<li><strong>Recent Unsubs Removed (last ${unsub_days} days):</strong> ${unsubSet.size}</li>` : ""}
//             <li><strong>Final Records in File:</strong> ${filteredRows.length}</li>
//           </ul>
//           <p>Regards,<br/>WEBDOC System</p>
//         `,
//         attachments: [
//           {
//             filename: fileName,
//             content: excelBuffer,
//             contentType:
//               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//           },
//         ],
//       });

//       if (!mailResult.success) {
//         return sendResponse({
//           res,
//           statusCode: 500,
//           success: false,
//           message: "Excel generated but email failed to send",
//           error: mailResult.error,
//         });
//       }

//       return sendResponse({
//         res,
//         statusCode: 200,
//         success: true,
//         message: `Export emailed successfully to ${email}`,
//         data: {
//           totalFromBalanceFilter: responseRows.length,
//           activeSubscribersRemoved: subscriberSet.size,
//           recentUnsubsRemoved: unsubSet.size,
//           finalRecords: filteredRows.length,
//           messageId: mailResult.messageId,
//         },
//       });
//     }

//     // ─────────────────────────────────────────────
//     // STEP 12: Send Excel attachment
//     // ─────────────────────────────────────────────

//     // Return the Excel file directly in the response
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     );
//     res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
//     return res.send(excelBuffer);
//   } catch (error) {
//     console.error("Export failed:", error);
//     return sendResponse({
//       res,
//       success: false,
//       statusCode: 500,
//       message: "Failed to export data",
//       error: error.message,
//     });
//   }
// };
const exportTableToExcel = async (req, res) => {
  try {
    const {
      id,
      unsub_days,
      unsub_remove,
      sub_remove,
      send_email,
      balance_limit,
      service_id,
    } = req.body;
    console.log("Request body:", req.body);

    if (!id || !balance_limit) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: "Id and balance_limit are required!",
      });
    }

    // 0. Fetch center quota config for this service (poc/cc emails + % quota per center)
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

    const [serviceRows] = await db.query(query, [service_id]);

    if (!serviceRows || serviceRows.length === 0) {
      return sendResponse({
        res,
        statusCode: 404,
        success: false,
        message: `No center quota configuration found for service_id ${service_id}`,
      });
    }

    // 1. Fetch file metadata from main DB (including remove_sub, remove_unsub)
    const [fileRows] = await db.execute(
      `SELECT id, file_path, file_name, job_name, response_table_name,
              status, balance_limit, service, remove_sub, remove_unsub
       FROM file_entity
       WHERE id = ? AND status = ?`,
      [id, "COMPLETED"],
    );

    const uploadedFile = fileRows[0];

    if (!uploadedFile) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: "File does not exist!",
      });
    }

    // 2. Validate unsub_days if remove_unsub is true
    if (unsub_remove) {
      if (!unsub_days || isNaN(Number(unsub_days)) || Number(unsub_days) <= 0) {
        return sendResponse({
          res,
          statusCode: 400,
          success: false,
          message:
            "unsub_days query param is required and must be a positive number when remove_unsub is enabled",
        });
      }
    }

    // 3. Get the correct pool based on service (HIS / HBS / MIS)
    let servicePool;
    try {
      servicePool = getPoolByService(uploadedFile.service);
    } catch (err) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: `Invalid service '${uploadedFile.service}'. Must be HIS, HBS, or MIS.`,
      });
    }

    // 4. Check response table exists in main DB
    const [tableExists] = await db.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [uploadedFile.response_table_name],
    );

    if (tableExists.length === 0) {
      return sendResponse({
        res,
        statusCode: 404,
        success: false,
        message: `Table '${uploadedFile.response_table_name}' does not exist`,
      });
    }

    // 5. Conditionally check subscriber / subscriber_unsub tables exist
    if (sub_remove) {
      const [subTableExists] = await servicePool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'subscriber' LIMIT 1`,
      );
      if (subTableExists.length === 0) {
        return sendResponse({
          res,
          statusCode: 404,
          success: false,
          message: `'subscriber' table does not exist in ${uploadedFile.service} database`,
        });
      }
    }

    if (unsub_remove) {
      const [unsubTableExists] = await servicePool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'subscriber_unsub' LIMIT 1`,
      );
      if (unsubTableExists.length === 0) {
        return sendResponse({
          res,
          statusCode: 404,
          success: false,
          message: `'subscriber_unsub' table does not exist in ${uploadedFile.service} database`,
        });
      }
    }

    // 6. Fetch response table data filtered by balance limit
    const balanceLimitInCents = Number(balance_limit) * 100;

    console.log(
      balanceLimitInCents,
      `Fetching MSISDNs from response table: ${uploadedFile.response_table_name}`,
    );

    const [responseRows] = await db.query(
      `SELECT msisdn, data->>'$.bal' AS balance
       FROM \`${uploadedFile.response_table_name}\`
       WHERE data->>'$.bal' IS NOT NULL
         AND data->>'$.bal' != 'null'
         AND data->>'$.bal' != ''
         AND CAST(data->>'$.bal' AS SIGNED) >= ?`,
      [balanceLimitInCents],
    );

    if (responseRows.length === 0) {
      return sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: "No records found matching the balance limit",
      });
    }

    console.log(`Total MSISDNs from response table: ${responseRows.length}`);

    const msisdnList = responseRows.map((r) => String(r.msisdn));
    const BATCH_SIZE = 1000;

    // ─────────────────────────────────────────────
    // STEP 7: Filter active subscribers (remove_sub)
    // ─────────────────────────────────────────────
    const subscriberSet = new Set();

    if (sub_remove) {
      console.log("Applying remove_sub filter...");

      for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
        const batch = msisdnList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => "?").join(", ");

        const [subRows] = await servicePool.query(
          `SELECT cellno FROM subscriber
           WHERE cellno IN (${placeholders})
             AND unsub_dt IS NULL`, // active subscribers only
          batch,
        );

        subRows.forEach((row) => {
          subscriberSet.add(String(row.cellno).replace(/^0/, ""));
        });
      }

      console.log(`Active subscribers to remove: ${subscriberSet.size}`);
    }

    // ─────────────────────────────────────────────
    // STEP 8: Filter recently unsubscribed (remove_unsub)
    // ─────────────────────────────────────────────
    const unsubSet = new Set();

    if (unsub_remove) {
      const days = Number(unsub_days);
      console.log(`Applying remove_unsub filter for last ${days} days...`);

      for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
        const batch = msisdnList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => "?").join(", ");

        // Fetch records unsubscribed within the last N days
        const [unsubRows] = await servicePool.query(
          `SELECT cellno FROM subscriber_unsub
           WHERE cellno IN (${placeholders})
             AND unsub_dt >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [...batch, days],
        );

        unsubRows.forEach((row) => {
          unsubSet.add(String(row.cellno).replace(/^0/, ""));
        });
      }

      console.log(`Recently unsubscribed to remove: ${unsubSet.size}`);
    }

    // ─────────────────────────────────────────────
    // STEP 9: Apply both filters to response rows
    // ─────────────────────────────────────────────
    const filteredRows = responseRows.filter((row) => {
      const msisdn = String(row.msisdn);
      if (subscriberSet.has(msisdn)) return false; // remove active sub
      if (unsubSet.has(msisdn)) return false; // remove recent unsub
      return true;
    });

    console.log(`Remaining records after all filters: ${filteredRows.length}`);

    if (filteredRows.length === 0) {
      return sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: "No records remaining after applying filters",
      });
    }

    // Helper: build an Excel buffer for a set of rows
    const buildExcelBuffer = async (rows) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("data");

      sheet.columns = [
        { header: "Sr No", key: "srNo", width: 10 },
        { header: "Msisdn", key: "msisdn", width: 20 },
        { header: "Balance", key: "balance", width: 15 },
      ];

      sheet.getRow(1).font = { bold: true };

      let serialNo = 1;
      for (const row of rows) {
        sheet.addRow({
          srNo: serialNo++,
          msisdn: row.msisdn,
          balance: row.balance ? Number(row.balance) / 100 : null,
        });
      }

      return workbook.xlsx.writeBuffer();
    };

    // ─────────────────────────────────────────────
    // STEP 10: Distribute filteredRows across centers
    // by percentage_quota, picking random & unique records,
    // then email each center's slice to its poc/cc email.
    // ─────────────────────────────────────────────
    if (send_email) {
      // Fisher–Yates shuffle so picks are random and unique (no overlap between centers)
      const shuffled = [...filteredRows];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const total = shuffled.length;

      // Largest remainder method: guarantees quotas are honored as closely as
      // possible (e.g. 30/40/30 of 10,000 -> exactly 3000/4000/3000) instead of
      // losing/gaining records to naive rounding.
      const rawCounts = serviceRows.map(
        (c) => (total * Number(c.percentage_quota)) / 100,
      );
      const floorCounts = rawCounts.map((n) => Math.floor(n));
      let allocated = floorCounts.reduce((a, b) => a + b, 0);
      let remainder = total - allocated;

      // Distribute leftover records (largest fractional part first)
      const fractionalOrder = rawCounts
        .map((n, idx) => ({ idx, frac: n - Math.floor(n) }))
        .sort((a, b) => b.frac - a.frac);

      const counts = [...floorCounts];
      for (let k = 0; k < remainder; k++) {
        counts[fractionalOrder[k % fractionalOrder.length].idx] += 1;
      }

      // Slice the shuffled array into contiguous, non-overlapping chunks per center
      const centerResults = [];
      let cursor = 0;

      for (let i = 0; i < serviceRows.length; i++) {
        const center = serviceRows[i];
        const count = counts[i];
        const centerRows = shuffled.slice(cursor, cursor + count);
        cursor += count;

        if (centerRows.length === 0) {
          centerResults.push({
            center_id: center.center_id,
            center_name: center.center_name,
            poc_email: center.poc_email,
            recordCount: 0,
            emailSent: false,
            skippedReason: "No records allocated (0 after rounding)",
          });
          continue;
        }

        const excelBuffer = await buildExcelBuffer(centerRows);
        const fileName = `${uploadedFile.service}_${center.center_name}_${uploadedFile.response_table_name}_export.xlsx`;

        const mailResult = await sendMail({
          to: center.poc_email,
          cc: center.cc_email,
          subject: `Export: ${uploadedFile.file_name} (${uploadedFile.service} - ${center.center_name})`,
          html: `
            <p>Hi,</p>

            <p>Please find attached the exported data for <strong>${uploadedFile.file_name}</strong>.</p>
            <ul>
              <li><strong>Service:</strong> ${uploadedFile.service}</li>
              <li><strong>Center:</strong> ${center.center_name}</li>
              <li><strong>Quota:</strong> ${center.percentage_quota}%</li>
              <li><strong>Balance Limit:</strong> ${balance_limit}</li>
              <li><strong>Total After Balance Filter:</strong> ${responseRows.length}</li>
              ${sub_remove ? `<li><strong>Active Subscribers Removed:</strong> ${subscriberSet.size}</li>` : ""}
              ${unsub_remove ? `<li><strong>Recent Unsubs Removed (last ${unsub_days} days):</strong> ${unsubSet.size}</li>` : ""}
              <li><strong>Records in This File:</strong> ${centerRows.length}</li>
            </ul>
            <p>Regards,<br/>WEBDOC System</p>
          `,
          attachments: [
            {
              filename: fileName,
              content: excelBuffer,
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        });

        centerResults.push({
          center_id: center.center_id,
          center_name: center.center_name,
          poc_email: center.poc_email,
          cc_email: center.cc_email,
          recordCount: centerRows.length,
          emailSent: !!mailResult.success,
          messageId: mailResult.messageId,
          error: mailResult.success ? undefined : mailResult.error,
        });
      }

      const anyFailed = centerResults.some(
        (c) => c.emailSent === false && c.recordCount > 0,
      );

      return sendResponse({
        res,
        statusCode: anyFailed ? 500 : 200,
        success: !anyFailed,
        message: anyFailed
          ? "Some emails failed to send, see data for details"
          : "Export emailed successfully to all centers",
        data: {
          totalFromBalanceFilter: responseRows.length,
          activeSubscribersRemoved: subscriberSet.size,
          recentUnsubsRemoved: unsubSet.size,
          finalRecords: filteredRows.length,
          centers: centerResults,
        },
      });
    }

    // ─────────────────────────────────────────────
    // STEP 11: send_email is false -> return one combined Excel file directly
    // ─────────────────────────────────────────────
    const excelBuffer = await buildExcelBuffer(filteredRows);
    const fileName = `${uploadedFile.service}_${uploadedFile.response_table_name}_export.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(excelBuffer);
  } catch (error) {
    console.error("Export failed:", error);
    return sendResponse({
      res,
      success: false,
      statusCode: 500,
      message: "Failed to export data",
      error: error.message,
    });
  }
};
const sendExcelToEmail = async (req, res) => {
  try {
    const { id, unsub_days, unsub_remove, to, cc, subject, message } = req.body;

    if (!id) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: "Id is required!",
      });
    }
    if (!to) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: "Email data is Required!",
      });
    }

    const [fileRows] = await db.execute(
      `SELECT id, file_path, file_name, job_name, response_table_name,
              status, balance_limit, service, remove_sub, remove_unsub
       FROM file_entity
       WHERE id = ? AND status = ?`,
      [id, "COMPLETED"],
    );

    const uploadedFile = fileRows[0];

    if (!uploadedFile) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: "File does not exist!",
      });
    }

    // 2. Validate unsub_days if remove_unsub is true
    // if (uploadedFile.remove_unsub == 1) {
    //   if (!unsub_days || isNaN(Number(unsub_days)) || Number(unsub_days) <= 0) {
    //     return sendResponse({
    //       res,
    //       statusCode: 400,
    //       success: false,
    //       message:
    //         "unsub_days query param is required and must be a positive number when remove_unsub is enabled",
    //     });
    //   }
    // }

    // 3. Get the correct pool based on service (HIS / HBS / MIS)
    let servicePool;
    try {
      servicePool = getPoolByService(uploadedFile.service);
    } catch (err) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: `Invalid service '${uploadedFile.service}'. Must be HIS, HBS, or MIS.`,
      });
    }

    // 4. Check response table exists in main DB
    const [tableExists] = await db.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [uploadedFile.response_table_name],
    );

    if (tableExists.length === 0) {
      return sendResponse({
        res,
        statusCode: 404,
        success: false,
        message: `Table '${uploadedFile.response_table_name}' does not exist`,
      });
    }

    // 5. Conditionally check subscriber / subscriber_unsub tables exist
    if (uploadedFile.remove_sub == 1) {
      const [subTableExists] = await servicePool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'subscriber' LIMIT 1`,
      );
      if (subTableExists.length === 0) {
        return sendResponse({
          res,
          statusCode: 404,
          success: false,
          message: `'subscriber' table does not exist in ${uploadedFile.service} database`,
        });
      }
    }

    if (uploadedFile.remove_unsub == 1) {
      const [unsubTableExists] = await servicePool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'subscriber_unsub' LIMIT 1`,
      );
      if (unsubTableExists.length === 0) {
        return sendResponse({
          res,
          statusCode: 404,
          success: false,
          message: `'subscriber_unsub' table does not exist in ${uploadedFile.service} database`,
        });
      }
    }

    // 6. Fetch response table data filtered by balance limit
    const balanceLimitInCents = Number(uploadedFile.balance_limit) * 100;

    console.log(
      `Fetching MSISDNs from response table: ${uploadedFile.response_table_name}`,
    );

    const [responseRows] = await db.query(
      `SELECT msisdn, data->>'$.bal' AS balance
       FROM \`${uploadedFile.response_table_name}\`
       WHERE data->>'$.bal' IS NOT NULL
         AND data->>'$.bal' != 'null'
         AND data->>'$.bal' != ''
         AND CAST(data->>'$.bal' AS SIGNED) >= ?`,
      [balanceLimitInCents],
    );

    if (responseRows.length === 0) {
      return sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: "No records found matching the balance limit",
      });
    }

    console.log(`Total MSISDNs from response table: ${responseRows.length}`);

    const msisdnList = responseRows.map((r) => String(r.msisdn));
    const BATCH_SIZE = 1000;

    // ─────────────────────────────────────────────
    // STEP 7: Filter active subscribers (remove_sub)
    // ─────────────────────────────────────────────
    const subscriberSet = new Set();

    if (uploadedFile.remove_sub == 1) {
      console.log("Applying remove_sub filter...");

      for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
        const batch = msisdnList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => "?").join(", ");

        const [subRows] = await servicePool.query(
          `SELECT cellno FROM subscriber
           WHERE cellno IN (${placeholders})
             AND unsub_dt IS NULL`, // active subscribers only
          batch,
        );

        subRows.forEach((row) => {
          subscriberSet.add(String(row.cellno).replace(/^0/, ""));
        });
      }

      console.log(`Active subscribers to remove: ${subscriberSet.size}`);
    }

    // ─────────────────────────────────────────────
    // STEP 8: Filter recently unsubscribed (remove_unsub)
    // ─────────────────────────────────────────────
    const unsubSet = new Set();

    if (uploadedFile.remove_unsub == 1) {
      const days = Number(unsub_days ?? 0);
      console.log(`Applying remove_unsub filter for last ${days} days...`);

      for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
        const batch = msisdnList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => "?").join(", ");

        // Fetch records unsubscribed within the last N days
        const [unsubRows] = await servicePool.query(
          `SELECT cellno FROM subscriber_unsub
           WHERE cellno IN (${placeholders})
             AND unsub_dt >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [...batch, days],
        );

        unsubRows.forEach((row) => {
          unsubSet.add(String(row.cellno).replace(/^0/, ""));
        });
      }

      console.log(`Recently unsubscribed to remove: ${unsubSet.size}`);
    }

    // ─────────────────────────────────────────────
    // STEP 9: Apply both filters to response rows
    // ─────────────────────────────────────────────
    const filteredRows = responseRows.filter((row) => {
      const msisdn = String(row.msisdn);
      if (subscriberSet.has(msisdn)) return false; // remove active sub
      if (unsubSet.has(msisdn)) return false; // remove recent unsub
      return true;
    });

    console.log(`Remaining records after all filters: ${filteredRows.length}`);

    if (filteredRows.length === 0) {
      return sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: "No records remaining after applying filters",
      });
    }

    // ─────────────────────────────────────────────
    // STEP 10: Build Excel in memory
    // ─────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("data");

    sheet.columns = [
      { header: "Sr No", key: "srNo", width: 10 },
      { header: "Msisdn", key: "msisdn", width: 20 },
      { header: "Balance", key: "balance", width: 15 },
    ];

    sheet.getRow(1).font = { bold: true };

    let serialNo = 1;
    for (const row of filteredRows) {
      sheet.addRow({
        srNo: serialNo++,
        msisdn: row.msisdn,
        balance: row.balance ? Number(row.balance) / 100 : null,
      });
    }

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const fileName = `${uploadedFile.service}_${uploadedFile.response_table_name}_export.xlsx`;

    // ─────────────────────────────────────────────
    // STEP 11: Send email with Excel attachment
    // ─────────────────────────────────────────────
    // const email = "Nabeel@Webdoc.com.pk";
    // ─────────────────────────────────────────────
    // STEP 11: Send email OR return Excel directly
    // ─────────────────────────────────────────────

    // const email = "hamzabhatti021@gmail.com";
    const ccRecipients = cc
      ? cc
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean)
      : [];
    const mailResult = await sendMail({
      to: to,
      cc: ccRecipients,
      subject:
        subject ||
        `Export: ${uploadedFile.file_name} (${uploadedFile.service})`,
      html: `
          <p>Hi,</p>
         <p>${message.replace(/\n/g, "<br/>")}</p>
          <p>Please find attached the exported data for <strong>${uploadedFile.file_name}</strong>.</p>
          <ul>
            <li><strong>Service:</strong> ${uploadedFile.service}</li>
            <li><strong>Balance Limit:</strong> ${uploadedFile.balance_limit}</li>
            <li><strong>Total After Balance Filter:</strong> ${responseRows.length}</li>
            ${uploadedFile.remove_sub == 1 ? `<li><strong>Active Subscribers Removed:</strong> ${subscriberSet.size}</li>` : ""}
            ${uploadedFile.remove_unsub == 1 ? `<li><strong>Recent Unsubs Removed (last ${unsub_days} days):</strong> ${unsubSet.size}</li>` : ""}
            <li><strong>Final Records in File:</strong> ${filteredRows.length}</li>
          </ul>
          <p>Regards,<br/>WEBDOC System</p>
        `,
      attachments: [
        {
          filename: fileName,
          content: excelBuffer,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    if (!mailResult.success) {
      return sendResponse({
        res,
        statusCode: 500,
        success: false,
        message: "Excel generated but email failed to send",
        error: mailResult.error,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      success: true,
      message: `Export emailed successfully to ${to}`,
      data: {
        totalFromBalanceFilter: responseRows.length,
        activeSubscribersRemoved: subscriberSet.size,
        recentUnsubsRemoved: unsubSet.size,
        finalRecords: filteredRows.length,
        messageId: mailResult.messageId,
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    return sendResponse({
      res,
      success: false,
      statusCode: 500,
      message: "Failed to export data",
      error: error.message,
    });
  }
};
module.exports = { uploadFile, getFiles, exportTableToExcel, sendExcelToEmail };
