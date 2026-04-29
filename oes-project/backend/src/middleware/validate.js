const { validationResult } = require('express-validator');
const { error } = require('../utils/response');
const xss = require('xss');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array().map(e => ({
      field: e.path,
      message: e.msg,
    })));
  }
  next();
};

// Sanitize request body against XSS
const sanitize = (req, res, next) => {
  const sanitizeValue = (val) => {
    if (typeof val === 'string') return xss(val.trim());
    if (Array.isArray(val)) return val.map(sanitizeValue);
    if (val && typeof val === 'object') {
      const cleaned = {};
      for (const key of Object.keys(val)) cleaned[key] = sanitizeValue(val[key]);
      return cleaned;
    }
    return val;
  };
  if (req.body) req.body = sanitizeValue(req.body);
  next();
};

module.exports = { validate, sanitize };
