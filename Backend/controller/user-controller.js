const db = require("../config/connection");
const bcrypt = require("bcrypt");
const { sendResponse } = require("../lib/api-response");

const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return sendResponse({
        res,
        success: false,
        message: "All fields are required",
        statusCode: 400,
      });
    }

    if (!["admin", "agent"].includes(role)) {
      return sendResponse({
        res,
        success: false,
        message: "Role must be admin or agent",
        statusCode: 400,
      });
    }

    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [
      email,
    ]);

    if (existing.length) {
      return sendResponse({
        res,
        success: false,
        message: "Email already exists",
        statusCode: 409,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users
      (name, password, email, role, is_active)
      VALUES (?, ?, ?, ?, TRUE)`,
      [name, hashedPassword, email, role],
    );

    return sendResponse({
      res,
      success: true,
      message: "User created successfully",
      statusCode: 201,
      data: {
        id: result.insertId,
        name,
        email,
        role,
      },
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      success: false,
      message: "Failed to create user",
      statusCode: 500,
      error: error.message,
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendResponse({
        res,
        success: false,
        message: "Email and password are required",
        statusCode: 400,
      });
    }

    const [rows] = await db.query(
      `SELECT id, name, email, password, role, is_active
       FROM users
       WHERE email = ?`,
      [email],
    );

    if (!rows.length) {
      return sendResponse({
        res,
        success: false,
        message: "Invalid email or password",
        statusCode: 401,
      });
    }

    const user = rows[0];

    if (!user.is_active) {
      return sendResponse({
        res,
        success: false,
        message: "User account is inactive",
        statusCode: 403,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return sendResponse({
        res,
        success: false,
        message: "Invalid email or password",
        statusCode: 401,
      });
    }

    return sendResponse({
      res,
      success: true,
      message: "Login successful",
      statusCode: 200,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error(error);

    return sendResponse({
      res,
      success: false,
      message: "Login failed",
      statusCode: 500,
      error: error.message,
    });
  }
};

module.exports = {
  createUser,
  loginUser,
};
