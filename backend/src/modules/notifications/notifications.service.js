const { query } = require('../../config/database');
const { sendEmail, emailTemplates } = require('../../config/email');

// ─── Create Notification ──────────────────────────────────────
const createNotification = async ({ recipientId, senderId, type, title, message, relatedExamId }) => {
  const result = await query(
    `INSERT INTO notifications (recipient_id, sender_id, type, title, message, related_exam_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [recipientId, senderId || null, type, title, message, relatedExamId || null]
  );

  // Check email preference and send
  try {
    const prefResult = await query(
      `SELECT np.*, u.email, u.full_name FROM notification_preferences np
       JOIN users u ON np.user_id = u.id WHERE np.user_id = $1`,
      [recipientId]
    );
    if (prefResult.rows.length) {
      const { email, full_name, ...prefs } = prefResult.rows[0];
      const typeMap = {
        'exam_scheduled': 'exam_scheduled', 'exam_reminder': 'exam_reminder',
        'exam_submitted': 'exam_submitted', 'result_published': 'result_published',
        'account_locked': 'account_locked', 'broadcast': 'broadcast', 'individual': 'individual'
      };
      const prefKey = typeMap[type];
      if (prefKey && prefs[prefKey] && email) {
        await sendEmail({ to: email, subject: title, html: `<p>Hello ${full_name},</p><p>${message}</p>` });
        await query(`UPDATE notifications SET email_sent = TRUE, email_sent_at = NOW() WHERE id = $1`, [result.rows[0].id]);
      }
    }
  } catch { /* non-critical */ }

  return result.rows[0].id;
};

// ─── Get User Notifications ───────────────────────────────────
const getNotifications = async (userId, { page = 1, limit = 20, unreadOnly } = {}) => {
  let where = 'WHERE n.recipient_id = $1';
  const params = [userId];
  let idx = 2;
  if (unreadOnly === 'true') { where += ` AND n.is_read = FALSE`; }

  const offset = (page - 1) * limit;
  const countResult = await query(`SELECT COUNT(*) FROM notifications n ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT n.*, u.full_name as sender_name, e.title as exam_title
     FROM notifications n
     LEFT JOIN users u ON n.sender_id = u.id
     LEFT JOIN exams e ON n.related_exam_id = e.id
     ${where}
     ORDER BY n.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  const unreadCount = await query(`SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND is_read = FALSE`, [userId]);

  return { notifications: result.rows, total, page, limit, unreadCount: parseInt(unreadCount.rows[0].count) };
};

// ─── Mark Read ────────────────────────────────────────────────
const markRead = async (notificationId, userId) => {
  await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND recipient_id = $2`,
    [notificationId, userId]
  );
};

const markAllRead = async (userId) => {
  await query(`UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE recipient_id = $1 AND is_read = FALSE`, [userId]);
};

// ─── Broadcast ────────────────────────────────────────────────
const broadcast = async (senderId, { title, message, targetRole, targetBatch, targetUserId }) => {
  let usersQuery = `SELECT id FROM users WHERE status = 'active'`;
  const params = [];
  let idx = 1;

  if (targetUserId) {
    usersQuery += ` AND id = $${idx++}`;
    params.push(targetUserId);
  } else {
    if (targetRole) { usersQuery += ` AND role = $${idx++}`; params.push(targetRole); }
    if (targetBatch) { usersQuery += ` AND batch = $${idx++}`; params.push(targetBatch); }
  }

  const users = await query(usersQuery, params);
  const type = targetUserId ? 'individual' : 'broadcast';

  for (const user of users.rows) {
    await createNotification({ recipientId: user.id, senderId, type, title, message });
  }

  return { sent: users.rows.length };
};

// ─── Preferences ──────────────────────────────────────────────
const getPreferences = async (userId) => {
  const result = await query(`SELECT * FROM notification_preferences WHERE user_id = $1`, [userId]);
  return result.rows[0] || {};
};

const updatePreferences = async (userId, prefs) => {
  const keys = ['exam_scheduled', 'exam_reminder', 'exam_submitted', 'result_published', 'account_locked', 'broadcast', 'individual'];
  const valid = {};
  keys.forEach(k => { if (prefs[k] !== undefined) valid[k] = prefs[k]; });

  const setClauses = Object.keys(valid).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = Object.values(valid);

  if (setClauses) {
    await query(
      `INSERT INTO notification_preferences (user_id, ${Object.keys(valid).join(', ')})
       VALUES ($1, ${values.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW()`,
      [userId, ...values]
    );
  }
};

module.exports = { createNotification, getNotifications, markRead, markAllRead, broadcast, getPreferences, updatePreferences };
