require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Reusable send mail function
 *
 * @param {Object} options
 * @param {string|string[]} options.to - recipient email(s)
 * @param {string} options.subject - email subject
 * @param {string} [options.text] - plain text body
 * @param {string} [options.html] - HTML body
 * @param {Array} [options.attachments] - file attachments
 */
async function sendMail({
  to,
  subject,
  cc = [],
  bcc = [],
  text = "",
  html = "",
  attachments = [],
}) {
  try {
    const info = await transporter.sendMail({
      from: `"WEBDOC" <${process.env.SMTP_USER}>`,
      to,
      cc, // ✅ added
      bcc, // optional
      subject,
      text,
      html,
      attachments, // 👈 important
    });

    console.log("Mail sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Mail error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { sendMail };
