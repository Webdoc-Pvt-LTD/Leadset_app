const express = require("express");
const {
  createBatch,
  getStatus,
  runNow,
} = require("../controller/auto-batch-controller");

const router = express.Router();

router.get("/status", getStatus);
router.post("/create", createBatch);
router.post("/run-now", runNow);

module.exports = router;
