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
    const { jobName, scheduleTime, balance_limit, service } = req.body;
    console.log(req.body);
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
    upload_date,
    status
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'PENDING')
  `,
      [
        fileName,
        filePath,
        jobName || null,
        scheduleTime || null,
        total_record,
        balanceLimitDecimal,
        service || null,
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
const getFiles = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        file_path,
        file_name,
        job_name,
        processed_record,
        response_table_name,
        status,
        total_record,
        upload_date,
        schedule_time,
        job_start_date,
        job_end_date,
        balance_limit,
        service,
        remove_sub,
        remove_unsub
      FROM file_entity
      ORDER BY upload_date DESC
    `;

    const [rows] = await db.query(query);

    return sendResponse({
      res,
      success: true,
      message: "Files fetched successfully",
      statusCode: 200,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching files:", error);

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
//     const { id } = req.query;

//     if (!id) {
//       return sendResponse({
//         res,
//         statusCode: 400,
//         success: false,
//         message: "Id is required!",
//       });
//     }

//     // 1. Fetch file metadata from main DB
//     const [fileRows] = await db.execute(
//       `SELECT id, file_path, file_name, job_name, response_table_name,
//               status, balance_limit, service
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

//     // 2. Get the correct pool based on service (HIS / HBS / MIS)
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

//     // 3. Check response table exists in main DB
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

//     // 4. Check subscriber table exists in service DB
//     const [subscriberTableExists] = await servicePool.query(
//       `SELECT 1 FROM information_schema.tables
//        WHERE table_schema = DATABASE() AND table_name = 'subscriber' LIMIT 1`,
//     );

//     if (subscriberTableExists.length === 0) {
//       return sendResponse({
//         res,
//         statusCode: 404,
//         success: false,
//         message: `'subscriber' table does not exist in ${uploadedFile.service} database`,
//       });
//     }

//     const balanceLimitInCents = Number(uploadedFile.balance_limit) * 100;

//     // 5. Fetch all MSISDNs from response table filtered by balance limit
//     console.log(
//       `Fetching MSISDNs from response table: ${uploadedFile.response_table_name}`,
//     );
//     const [responseRows] = await db.query(
//       `SELECT
//         msisdn,
//         data->>'$.bal' AS balance
//        FROM \`${uploadedFile.response_table_name}\`
//        WHERE data->>'$.bal' IS NOT NULL
//          AND data->>'$.bal' != 'null'
//          AND data->>'$.bal' != ''
//          AND CAST(data->>'$.bal' AS UNSIGNED) >= ?`,
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

//     // 6. Extract MSISDNs from response table
//     // Normalize: remove leading country code if needed (03001234567 vs 3001234567)
//     const msisdnList = responseRows.map((r) => String(r.msisdn));

//     console.log(`Total MSISDNs from response table: ${msisdnList.length}`);

//     // 7. Fetch subscriber cellnos from service DB that exist in our msisdn list
//     //    We do this in batches to avoid hitting MySQL's IN() limit
//     const BATCH_SIZE = 1000;
//     const subscriberSet = new Set();

//     for (let i = 0; i < msisdnList.length; i += BATCH_SIZE) {
//       const batch = msisdnList.slice(i, i + BATCH_SIZE);
//       const placeholders = batch.map(() => "?").join(", ");

//       const [subscriberRows] = await servicePool.query(
//         `SELECT cellno FROM subscriber WHERE cellno IN (${placeholders})`,
//         batch,
//       );

//       // Strip leading zero from cellno when adding to Set
//       subscriberRows.forEach((row) => {
//         const normalized = String(row.cellno).replace(/^0/, ""); // "03001234567" → "3001234567"
//         subscriberSet.add(normalized);
//       });
//     }

//     console.log(
//       `Total subscribers found in ${uploadedFile.service} DB: ${subscriberSet.size}`,
//     );

//     // 8. Filter: keep only MSISDNs NOT in subscriber table
//     const filteredRows = responseRows.filter(
//       (row) => !subscriberSet.has(String(row.msisdn)),
//     );

//     console.log(`Remaining records after filtering: ${filteredRows.length}`);

//     if (filteredRows.length === 0) {
//       return sendResponse({
//         res,
//         statusCode: 200,
//         success: true,
//         message:
//           "No records remaining after filtering against subscriber table",
//       });
//     }

//     // // 9. Write to Excel
//     // res.setHeader(
//     //   "Content-Type",
//     //   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//     // );
//     // res.setHeader(
//     //   "Content-Disposition",
//     //   `attachment; filename=${uploadedFile.response_table_name}_export.xlsx`,
//     // );

//     // const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
//     //   stream: res,
//     //   useStyles: false,
//     //   useSharedStrings: false,
//     // });
//     const workbook = new ExcelJS.Workbook();
//     const sheet = workbook.addWorksheet("data");
//     sheet.getRow(1).font = { bold: true };
//     sheet.columns = [
//       { header: "Sr No", key: "srNo", width: 10 },
//       { header: "Msisdn", key: "msisdn", width: 20 },
//       { header: "Balance", key: "balance", width: 15 },
//     ];

//     // 10. Write filtered rows to Excel
//     let serialNo = 1;
//     for (const row of filteredRows) {
//       sheet
//         .addRow({
//           srNo: serialNo++,
//           msisdn: row.msisdn,
//           balance: row.balance ? Number(row.balance) / 100 : null,
//         })
//         .commit();
//     }
//     const excelBuffer = await workbook.xlsx.writeBuffer();
//     const fileName = `${uploadedFile.service}_${uploadedFile.response_table_name}_export.xlsx`;
//     const email = "Nabeel@Webdoc.com.pk";
//     const mailResult = await sendMail({
//       to: email,
//       cc: "m.irfan@webdocoffice.com.pk",
//       subject: `Export: ${uploadedFile.file_name} (${uploadedFile.service})`,
//       html: `
//         <p>Hi,</p>
//         <p>Please find attached the exported data for <strong>${uploadedFile.file_name}</strong>.</p>
//         <ul>
//           <li><strong>Service:</strong> ${uploadedFile.service}</li>
//           <li><strong>Total Records:</strong> ${filteredRows.length}</li>
//           <li><strong>Balance Limit:</strong> ${uploadedFile.balance_limit}</li>
//         </ul>
//         <p>Regards,<br/>WEBDOC System</p>
//       `,
//       attachments: [
//         {
//           filename: fileName,
//           content: excelBuffer, // ← Buffer directly, no file on disk
//           contentType:
//             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//         },
//       ],
//     });
//     if (!mailResult.success) {
//       return sendResponse({
//         res,
//         statusCode: 500,
//         success: false,
//         message: "Excel generated but email failed to send",
//         error: mailResult.error,
//       });
//     }
//     return sendResponse({
//       res,
//       statusCode: 200,
//       success: true,
//       message: `Export emailed successfully to ${email}`,
//       data: {
//         totalRecords: filteredRows.length,
//         messageId: mailResult.messageId,
//       },
//     });
//     // await sheet.commit();
//     // await workbook.commit();
//     res.end();
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
    const { id, unsub_days, unsub_remove } = req.query;

    if (!id) {
      return sendResponse({
        res,
        statusCode: 400,
        success: false,
        message: "Id is required!",
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
    if (unsub_remove == "true") {
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

    if (unsub_remove == "true") {
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

    if (unsub_remove == "true") {
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
    // STEP 11: Send Excel attachment
    // ─────────────────────────────────────────────

    // Return the Excel file directly in the response
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
