const express = require("express");
const {
  getServices,
  getServiceQuota,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  updateService,
} = require("../controller/services-controller");

const router = express.Router();

router.get("/all", getServices);
router.put("/schedules/:schedule_id", updateSchedule);
router.delete("/schedules/:schedule_id", deleteSchedule);
router.get("/:service_id/schedules", getSchedules);
router.post("/:service_id/schedules", createSchedule);
router.get("/:service_id/quota", getServiceQuota);
router.put("/update/:service_id", updateService);

module.exports = router;
