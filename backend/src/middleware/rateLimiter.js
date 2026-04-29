const rateLimit = require('express-rate-limit');
const { cache } = require('../config/redis');
const { error } = require('../utils/response');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => error(res, 'Too many requests, please try again later', 429),
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => error(res, 'Too many login attempts, please try again in 15 minutes', 429),
});

// Redis-backed login failure tracker
const trackLoginFailure = async (email) => {
  const key = `login_fail:${email}`;
  const count = await cache.increment(key, 900); // 15 min TTL
  return count;
};

const resetLoginFailures = async (email) => {
  await cache.del(`login_fail:${email}`);
};

const getLoginFailures = async (email) => {
  const val = await cache.get(`login_fail:${email}_raw`) || 0;
  return parseInt(val) || 0;
};

module.exports = { apiLimiter, authLimiter, trackLoginFailure, resetLoginFailures, getLoginFailures };
