const express = require("express");
const router = express.Router();

const { createUser, loginUser } = require("../controller/user-controller");

router.post("/create", createUser);
router.post("/login", loginUser);

module.exports = router;
