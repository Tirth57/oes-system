const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { cache } = require('../config/redis');
const { error } = require('../utils/response');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Authentication required', 401);
    }

    const token = authHeader.split(' ')[1];

    // Check blacklist
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isBlacklisted = await cache.get(`blacklist:${tokenHash}`);
    if (isBlacklisted) {
      return error(res, 'Token has been invalidated', 401);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') return error(res, 'Token expired', 401);
      return error(res, 'Invalid token', 401);
    }

    // Fetch user
    const result = await query(
      `SELECT id, email, role, status, full_name, enrollment_number, department, batch, theme_preference
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (!result.rows.length) return error(res, 'User not found', 401);
    const user = result.rows[0];

    if (user.status === 'locked') return error(res, 'Account is locked', 403);
    if (user.status === 'inactive') return error(res, 'Account is inactive', 403);
    if (user.status === 'pending_verification') return error(res, 'Email not verified', 403);

    // Refresh session activity
    await query(`UPDATE users SET last_active = NOW() WHERE id = $1`, [user.id]);

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err);
    return error(res, 'Authentication failed', 500);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return error(res, 'Authentication required', 401);
  if (!roles.includes(req.user.role)) {
    return error(res, 'Insufficient permissions', 403);
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const result = await query(`SELECT id, email, role, status, full_name FROM users WHERE id = $1`, [decoded.id]);
    if (result.rows.length) req.user = result.rows[0];
  } catch { /* optional */ }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };
