const { CronJob } = require('cron');
const { query } = require('../config/database');
const { sendEmail, emailTemplates } = require('../config/email');
const logger = require('./logger');

// ─── Unlock expired locked accounts ──────────────────────────
new CronJob('*/5 * * * *', async () => {
  try {
    await query(
      `UPDATE users SET status = 'active', failed_login_attempts = 0, locked_until = NULL
       WHERE status = 'locked' AND locked_until < NOW()`
    );
  } catch (err) { logger.error('Cron unlock error:', err.message); }
}, null, true);

// ─── Mark exams as active when start time arrives ─────────────
new CronJob('* * * * *', async () => {
  try {
    await query(
      `UPDATE exams SET status = 'active'
       WHERE status = 'scheduled' AND start_datetime <= NOW() AND end_datetime > NOW()`
    );
  } catch (err) { logger.error('Cron exam activate error:', err.message); }
}, null, true);

// ─── Mark exams as completed when end time passes ─────────────
new CronJob('* * * * *', async () => {
  try {
    // Auto-submit any in-progress submissions for ended exams
    const expiredSubs = await query(
      `SELECT es.id, es.user_id FROM exam_submissions es
       JOIN exams e ON es.exam_id = e.id
       WHERE es.status = 'in_progress' AND e.end_datetime < NOW()`
    );
    for (const sub of expiredSubs.rows) {
      try {
        await query(
          `UPDATE exam_submissions SET status = 'auto_submitted', submitted_at = NOW()
           WHERE id = $1 AND status = 'in_progress'`,
          [sub.id]
        );
        const { autoGrade } = require('../modules/evaluation/evaluation.service');
        await autoGrade(sub.id);
      } catch (e) { logger.error('Cron auto-submit error:', e.message); }
    }

    await query(
      `UPDATE exams SET status = 'completed'
       WHERE status = 'active' AND end_datetime < NOW()`
    );
  } catch (err) { logger.error('Cron exam complete error:', err.message); }
}, null, true);

// ─── Send 1-hour exam reminders ──────────────────────────────
new CronJob('*/10 * * * *', async () => {
  try {
    const exams = await query(
      `SELECT e.id, e.title, e.start_datetime FROM exams e
       WHERE e.status = 'scheduled'
         AND e.start_datetime BETWEEN NOW() + INTERVAL '50 minutes' AND NOW() + INTERVAL '70 minutes'`
    );

    for (const exam of exams.rows) {
      const students = await query(
        `SELECT u.id, u.full_name, u.email FROM users u WHERE u.role = 'student' AND u.status = 'active'`
      );
      for (const student of students.rows) {
        const emailContent = emailTemplates.examReminder(student.full_name, exam.title, exam.start_datetime);
        await sendEmail({ to: student.email, ...emailContent });

        await query(
          `INSERT INTO notifications (recipient_id, type, title, message, related_exam_id)
           VALUES ($1, 'exam_reminder', $2, $3, $4) ON CONFLICT DO NOTHING`,
          [student.id, `Exam Reminder: ${exam.title}`, `Your exam "${exam.title}" starts in about 1 hour.`, exam.id]
        );
      }
    }
  } catch (err) { logger.error('Cron reminder error:', err.message); }
}, null, true);

// ─── Clean expired JWT blacklist entries ──────────────────────
new CronJob('0 2 * * *', async () => {
  try {
    await query(`DELETE FROM token_blacklist WHERE expires_at < NOW()`);
    logger.info('Cleaned expired token blacklist entries');
  } catch (err) { logger.error('Cron cleanup error:', err.message); }
}, null, true);

logger.info('✅ Cron jobs initialized');
