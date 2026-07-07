const express = require("express");
const { getCenters, createCenter } = require("../controller/center-controller");
const router = express.Router();
router.get("/all", getCenters);
router.post("/create", createCenter);
module.exports = router;
