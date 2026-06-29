const express = require("express");
const { dashboardData } = require("../controller/dashboard-controller");
const router = express.Router();
router.get("/stats", dashboardData);
module.exports = router;
