// routes/fileRoutes.js

const express = require("express");
const upload = require("../config/multer");
const {
  uploadFile,
  getFiles,
  exportTableToExcel,
  sendExcelToEmail,
} = require("../controller/file-controller");
const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.get("/all", getFiles);
router.get("/export", exportTableToExcel);
router.post("/send-email", sendExcelToEmail);

module.exports = router;
