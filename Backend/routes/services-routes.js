const express = require("express");
const { getServices } = require("../controller/services-controller");
const router = express.Router();

router.get("/all", getServices);
module.exports = router;
