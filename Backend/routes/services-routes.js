const express = require("express");
const {
  getServices,
  getServiceQuota,
} = require("../controller/services-controller");
const router = express.Router();

router.get("/all", getServices);
router.get("/:service_id/quota", getServiceQuota);
module.exports = router;
