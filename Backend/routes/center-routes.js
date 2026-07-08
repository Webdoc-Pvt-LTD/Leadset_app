const express = require("express");
const {
  getCenters,
  createCenter,
  assignServiceToCenter,
  getCenterAssignments,
  updateCenter,
} = require("../controller/center-controller");
const router = express.Router();
router.get("/all", getCenters);
router.post("/create", createCenter);
router.post("/assign-service", assignServiceToCenter);
router.get("/assignments/:center_id", getCenterAssignments);
router.put("/update/:id", updateCenter);
module.exports = router;
