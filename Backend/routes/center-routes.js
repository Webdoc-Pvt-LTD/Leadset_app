const express = require("express");
const {
  getCenters,
  getCenterServices,
} = require("../controller/center-controller");
const router = express.Router();
router.get("/all", getCenters);
router.get("/services/:center_id", getCenterServices);
module.exports = router;
