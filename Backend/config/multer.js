const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ✅ Absolute uploads path
const uploadDir = path.join(__dirname, "../uploads");

// ✅ Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// ✅ Optional: File filter (IMPORTANT)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [".txt", ".csv"];

  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedTypes.includes(ext)) {
    return cb(new Error("Only .txt and .csv files are allowed"));
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
});
