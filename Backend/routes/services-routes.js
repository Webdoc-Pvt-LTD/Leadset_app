const express = require("express");
const {
  getServices,
  getServiceQuota,
  updateService,
} = require("../controller/services-controller");
const router = express.Router();

router.get("/all", getServices);
router.get("/:service_id/quota", getServiceQuota);
router.put("/update/:service_id", updateService);
module.exports = router;
