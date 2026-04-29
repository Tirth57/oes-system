const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../../config/database');
const { cache } = require('../../config/redis');
const { sendEmail, emailTemplates } = require('../../config/email');
const { generateToken, hashToken } = require('../../utils/crypto');
const { auditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';
const MAX_FAILURES = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Register ────────────────────────────────────────────────
const register = async (data) => {
  const { email, password, fullName, enrollmentNumber, department, contact, batch } = data;

  // Duplicate check
  const existing = await query(
    `SELECT id FROM users WHERE email = $1 OR ($2::text IS NOT NULL AND enrollment_number = $2)`,
    [email.toLowerCase(), enrollmentNumber || null]
  );
  if (existing.rows.length) throw { status: 409, message: 'Email or enrollment number already exists' };

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const verificationToken = generateToken();
  const tokenExpires = new Date(Date.now() + 24 * 3600 * 1000);

  const result = await query(
    `INSERT INTO users (email, password_hash, role, status, full_name, enrollment_number, department, contact, batch,
       verification_token, verification_token_expires)
     VALUES ($1, $2, 'student', 'pending_verification', $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, email, full_name, role`,
    [email.toLowerCase(), passwordHash, fullName, enrollmentNumber || null, department || null,
     contact || null, batch || null, verificationToken, tokenExpires]
  );

  const user = result.rows[0];

  // Create notification preferences
  await query(`INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [user.id]);

  // Send verification email
  const emailContent = emailTemplates.verificationEmail(user.full_name, verificationToken, FRONTEND_URL);
  await sendEmail({ to: email, ...emailContent });

  await auditLog({ action: 'USER_REGISTERED', entityType: 'user', entityId: user.id, newValues: { email, role: 'student' } });

  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
};

// ─── Verify Email ─────────────────────────────────────────────
const verifyEmail = async (token) => {
  const result = await query(
    `SELECT id FROM users WHERE verification_token = $1 AND verification_token_expires > NOW()`,
    [token]
  );
  if (!result.rows.length) throw { status: 400, message: 'Invalid or expired verification token' };

  await query(
    `UPDATE users SET email_verified = TRUE, status = 'active', verification_token = NULL, verification_token_expires = NULL
     WHERE id = $1`,
    [result.rows[0].id]
  );

  return { message: 'Email verified successfully' };
};

// ─── Login ────────────────────────────────────────────────────
const login = async ({ email, password, ipAddress, userAgent }) => {
  const result = await query(
    `SELECT id, email, password_hash, role, status, full_name, enrollment_number, department, batch,
            failed_login_attempts, locked_until, email_verified, theme_preference
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (!result.rows.length) throw { status: 401, message: 'Invalid email or password' };

  const user = result.rows[0];

  // Check lock
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw { status: 403, message: `Account locked. Try again in ${minutes} minute(s)` };
  }

  if (user.status === 'inactive') throw { status: 403, message: 'Account is inactive' };
  if (!user.email_verified && user.status === 'pending_verification') {
    throw { status: 403, message: 'Please verify your email before logging in' };
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatch) {
    const failures = user.failed_login_attempts + 1;
    if (failures >= MAX_FAILURES) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2, status = 'locked' WHERE id = $3`,
        [failures, lockedUntil, user.id]
      );
      // Send lock email
      const emailContent = emailTemplates.accountLocked(user.full_name, lockedUntil);
      await sendEmail({ to: user.email, ...emailContent });
      throw { status: 403, message: 'Account locked due to 5 failed attempts. Try again in 15 minutes' };
    }
    await query(`UPDATE users SET failed_login_attempts = $1 WHERE id = $2`, [failures, user.id]);
    throw { status: 401, message: `Invalid email or password (${MAX_FAILURES - failures} attempts remaining)` };
  }

  // Success — reset failures and update last login
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, status = 'active', last_login = NOW(), last_active = NOW() WHERE id = $1`,
    [user.id]
  );

  const payload = { id: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh', { expiresIn: '7d' });

  // Cache session
  await cache.setSession(user.id, { userId: user.id, role: user.role, loginAt: new Date() }, 1800);

  await auditLog({ userId: user.id, action: 'USER_LOGIN', entityType: 'user', entityId: user.id, ipAddress, userAgent });

  return {
    token,
    refreshToken,
    user: {
      id: user.id, email: user.email, fullName: user.full_name, role: user.role,
      department: user.department, batch: user.batch, enrollmentNumber: user.enrollment_number,
      theme: user.theme_preference,
    },
  };
};

// ─── Logout ───────────────────────────────────────────────────
const logout = async (token, userId) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  // Store in blacklist with 24h TTL
  await cache.set(`blacklist:${tokenHash}`, true, 86400);
  await cache.delSession(userId);
  await auditLog({ userId, action: 'USER_LOGOUT', entityType: 'user', entityId: userId });
};

// ─── Refresh Token ────────────────────────────────────────────
const refreshToken = async (refreshTokenStr) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshTokenStr, process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh');
  } catch {
    throw { status: 401, message: 'Invalid or expired refresh token' };
  }
  const result = await query(`SELECT id, email, role, status FROM users WHERE id = $1`, [decoded.id]);
  if (!result.rows.length) throw { status: 401, message: 'User not found' };
  const user = result.rows[0];
  if (user.status !== 'active') throw { status: 403, message: 'Account is not active' };

  const payload = { id: user.id, email: user.email, role: user.role };
  const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return { token: newToken };
};

// ─── Forgot Password ──────────────────────────────────────────
const forgotPassword = async (email) => {
  const result = await query(`SELECT id, full_name, status FROM users WHERE email = $1`, [email.toLowerCase()]);
  // Always return success to prevent user enumeration
  if (!result.rows.length) return;

  const user = result.rows[0];
  const token = generateToken();
  const expires = new Date(Date.now() + 3600 * 1000); // 1 hour

  await query(
    `UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3`,
    [token, expires, user.id]
  );

  const emailContent = emailTemplates.passwordReset(user.full_name, token, FRONTEND_URL);
  await sendEmail({ to: email, ...emailContent });
};

// ─── Reset Password ───────────────────────────────────────────
const resetPassword = async (token, newPassword) => {
  const result = await query(
    `SELECT id FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()`,
    [token]
  );
  if (!result.rows.length) throw { status: 400, message: 'Invalid or expired reset token' };

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(
    `UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2`,
    [passwordHash, result.rows[0].id]
  );

  await auditLog({ userId: result.rows[0].id, action: 'PASSWORD_RESET', entityType: 'user', entityId: result.rows[0].id });
};

// ─── Get Profile ──────────────────────────────────────────────
const getProfile = async (userId) => {
  const result = await query(
    `SELECT id, email, role, status, full_name, enrollment_number, department, contact, batch,
            profile_image, email_verified, last_login, created_at, theme_preference
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rows.length) throw { status: 404, message: 'User not found' };
  return result.rows[0];
};

// ─── Update Profile ───────────────────────────────────────────
const updateProfile = async (userId, data) => {
  const { fullName, department, contact, batch, themePreference } = data;
  await query(
    `UPDATE users SET full_name = COALESCE($1, full_name), department = COALESCE($2, department),
     contact = COALESCE($3, contact), batch = COALESCE($4, batch),
     theme_preference = COALESCE($5, theme_preference) WHERE id = $6`,
    [fullName, department, contact, batch, themePreference, userId]
  );
  return getProfile(userId);
};

// ─── Change Password ──────────────────────────────────────────
const changePassword = async (userId, currentPassword, newPassword) => {
  const result = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!result.rows.length) throw { status: 404, message: 'User not found' };

  const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!match) throw { status: 400, message: 'Current password is incorrect' };

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);
  await auditLog({ userId, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: userId });
};

// ─── Admin: List Users ────────────────────────────────────────
const listUsers = async ({ role, status, search, page = 1, limit = 20 }) => {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  if (role) { whereClause += ` AND role = $${idx++}`; params.push(role); }
  if (status) { whereClause += ` AND status = $${idx++}`; params.push(status); }
  if (search) {
    whereClause += ` AND (full_name ILIKE $${idx} OR email ILIKE $${idx} OR enrollment_number ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }

  const offset = (page - 1) * limit;
  const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  const usersResult = await query(
    `SELECT id, email, role, status, full_name, enrollment_number, department, batch, last_login, created_at
     FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { users: usersResult.rows, total, page, limit };
};

// ─── Admin: Update User Status ────────────────────────────────
const updateUserStatus = async (adminId, targetUserId, status) => {
  await query(`UPDATE users SET status = $1 WHERE id = $2`, [status, targetUserId]);
  await auditLog({ userId: adminId, action: 'USER_STATUS_UPDATED', entityType: 'user', entityId: targetUserId, newValues: { status } });
};

module.exports = {
  register, verifyEmail, login, logout, refreshToken,
  forgotPassword, resetPassword, getProfile, updateProfile,
  changePassword, listUsers, updateUserStatus
};
