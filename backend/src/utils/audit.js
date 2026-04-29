const { query } = require('../config/database');
const logger = require('./logger');

const auditLog = async ({ userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent }) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId || null,
        action,
        entityType || null,
        entityId || null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress || null,
        userAgent || null,
      ]
    );
  } catch (err) {
    logger.error('Audit log error:', err.message);
  }
};

module.exports = { auditLog };
