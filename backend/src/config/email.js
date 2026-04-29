const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      pool: true,
      maxConnections: 5,
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.warn('Email not configured - skipping email send');
      return { messageId: 'not-configured', preview: 'Email not sent (SMTP not configured)' };
    }
    const info = await getTransporter().sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'OES'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error('Email send error:', err.message);
    // Non-fatal — don't throw
    return null;
  }
};

const emailTemplates = {
  verificationEmail: (name, token, frontendUrl) => ({
    subject: 'Verify Your OES Account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9">
        <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;border-radius:10px 10px 0 0;text-align:center">
          <h1 style="color:white;margin:0">Online Examination System</h1>
        </div>
        <div style="background:white;padding:30px;border-radius:0 0 10px 10px">
          <h2>Hello, ${name}!</h2>
          <p>Please verify your email address to activate your account.</p>
          <a href="${frontendUrl}/verify-email.html?token=${token}" 
             style="display:inline-block;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold">
            Verify Email
          </a>
          <p style="color:#999;font-size:12px;margin-top:20px">This link expires in 24 hours.</p>
        </div>
      </div>`,
  }),

  passwordReset: (name, token, frontendUrl) => ({
    subject: 'Reset Your OES Password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9">
        <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;border-radius:10px 10px 0 0;text-align:center">
          <h1 style="color:white;margin:0">Password Reset</h1>
        </div>
        <div style="background:white;padding:30px;border-radius:0 0 10px 10px">
          <h2>Hello, ${name}!</h2>
          <p>You requested a password reset. Click below to reset your password.</p>
          <a href="${frontendUrl}/reset-password.html?token=${token}" 
             style="display:inline-block;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold">
            Reset Password
          </a>
          <p style="color:#999;font-size:12px;margin-top:20px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
        </div>
      </div>`,
  }),

  examReminder: (name, examTitle, startTime) => ({
    subject: `Exam Reminder: ${examTitle} starts in 1 hour`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2>Exam Reminder</h2>
        <p>Hello ${name},</p>
        <p>Your exam <strong>${examTitle}</strong> starts at <strong>${new Date(startTime).toLocaleString()}</strong> — that's in about 1 hour.</p>
        <p>Please ensure you have a stable internet connection and are in a quiet environment.</p>
      </div>`,
  }),

  resultPublished: (name, examTitle, percentage, grade) => ({
    subject: `Results Published: ${examTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2>Results Published</h2>
        <p>Hello ${name},</p>
        <p>Results for <strong>${examTitle}</strong> have been published.</p>
        <p>Your Score: <strong>${percentage.toFixed(2)}%</strong> | Grade: <strong>${grade}</strong></p>
        <p>Login to OES to view detailed results.</p>
      </div>`,
  }),

  accountLocked: (name, unlockTime) => ({
    subject: 'Account Temporarily Locked',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#e53e3e">Account Locked</h2>
        <p>Hello ${name},</p>
        <p>Your account has been temporarily locked due to 5 failed login attempts.</p>
        <p>Your account will be unlocked at <strong>${new Date(unlockTime).toLocaleString()}</strong>.</p>
      </div>`,
  }),
};

module.exports = { sendEmail, emailTemplates };
