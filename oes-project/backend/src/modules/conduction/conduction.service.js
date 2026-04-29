const { query, transaction } = require('../../config/database');
const { cache } = require('../../config/redis');
const { auditLog } = require('../../utils/audit');
const { v4: uuidv4 } = require('uuid');
const evaluationService = require('../evaluation/evaluation.service');
const notificationsService = require('../notifications/notifications.service');

// ─── Start Exam ───────────────────────────────────────────────
const startExam = async (examId, userId, ipAddress, userAgent) => {
  const examResult = await query(
    `SELECT e.*, s.name as subject_name FROM exams e LEFT JOIN subjects s ON e.subject_id = s.id WHERE e.id = $1`,
    [examId]
  );
  if (!examResult.rows.length) throw { status: 404, message: 'Exam not found' };
  const exam = examResult.rows[0];

  const now = new Date();
  if (exam.status !== 'scheduled' && exam.status !== 'active') {
    throw { status: 400, message: 'Exam is not available for taking' };
  }
  if (new Date(exam.start_datetime) > now) {
    throw { status: 400, message: 'Exam has not started yet' };
  }
  if (new Date(exam.end_datetime) < now) {
    throw { status: 400, message: 'Exam has already ended' };
  }

  // Check existing submission
  const existingSub = await query(
    `SELECT id, status FROM exam_submissions WHERE exam_id = $1 AND user_id = $2`,
    [examId, userId]
  );
  if (existingSub.rows.length) {
    const sub = existingSub.rows[0];
    if (['submitted', 'auto_submitted'].includes(sub.status)) {
      throw { status: 409, message: 'You have already submitted this exam' };
    }
    // Resume existing submission
    return getSubmissionForExam(sub.id, exam);
  }

  // Mark exam active if first student starts it
  if (exam.status === 'scheduled') {
    await query(`UPDATE exams SET status = 'active' WHERE id = $1`, [examId]);
  }

  // Session token expires at exam end + buffer
  const bufferMinutes = parseInt(process.env.EXAM_SESSION_BUFFER) / 60 || 30;
  const tokenExpires = new Date(new Date(exam.end_datetime).getTime() + bufferMinutes * 60 * 1000);
  const sessionToken = uuidv4();

  // Create submission
  const subResult = await query(
    `INSERT INTO exam_submissions (exam_id, user_id, status, ip_address, user_agent, token, token_expires)
     VALUES ($1, $2, 'in_progress', $3, $4, $5, $6) RETURNING *`,
    [examId, userId, ipAddress, userAgent, sessionToken, tokenExpires]
  );
  const submission = subResult.rows[0];

  // Get questions (with shuffling if enabled)
  let questionsQuery = `
    SELECT eq.display_order, q.id, q.question_text, q.question_type, q.difficulty,
           q.marks, q.image_url,
           (SELECT json_agg(json_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text) ORDER BY
            ${exam.shuffle_options ? 'RANDOM()' : 'o.display_order'})
            FROM question_options o WHERE o.question_id = q.id) as options
    FROM exam_questions eq
    JOIN questions q ON eq.question_id = q.id
    WHERE eq.exam_id = $1
    ORDER BY ${exam.shuffle_questions ? 'RANDOM()' : 'eq.display_order'}`;

  const questionsResult = await query(questionsQuery, [examId]);
  const questions = questionsResult.rows;

  // Pre-populate unanswered answer slots
  for (const q of questions) {
    await query(
      `INSERT INTO submission_answers (submission_id, question_id, status)
       VALUES ($1, $2, 'unanswered') ON CONFLICT DO NOTHING`,
      [submission.id, q.id]
    );
  }

  // Cache submission state in Redis
  const cacheData = {
    submissionId: submission.id,
    examId,
    userId,
    startedAt: submission.started_at,
    endDatetime: exam.end_datetime,
    durationMinutes: exam.duration_minutes,
    tabSwitches: 0,
    maxTabSwitches: exam.max_tab_switches,
  };
  await cache.set(`exam_session:${submission.id}`, cacheData, exam.duration_minutes * 60 + 1800);

  return {
    submissionId: submission.id,
    token: sessionToken,
    exam: {
      id: exam.id, title: exam.title, subject: exam.subject_name,
      instructions: exam.instructions, durationMinutes: exam.duration_minutes,
      totalMarks: exam.total_marks, startDatetime: exam.start_datetime,
      endDatetime: exam.end_datetime, allowNavigation: exam.allow_navigation,
      maxTabSwitches: exam.max_tab_switches,
    },
    questions: questions.map((q, i) => ({ ...q, index: i })),
  };
};

// ─── Resume helper ────────────────────────────────────────────
const getSubmissionForExam = async (submissionId, exam) => {
  const questions = await query(
    `SELECT q.id, q.question_text, q.question_type, q.difficulty, q.marks, q.image_url,
            sa.status as answer_status, sa.selected_option, sa.answer_text,
            (SELECT json_agg(json_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text))
             FROM question_options o WHERE o.question_id = q.id) as options
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     WHERE sa.submission_id = $1`,
    [submissionId]
  );
  return { submissionId, exam, questions: questions.rows };
};

// ─── Save Answer ──────────────────────────────────────────────
const saveAnswer = async (submissionId, questionId, answerData, userId) => {
  // Verify submission belongs to user and is in progress
  const subResult = await query(
    `SELECT es.*, e.end_datetime FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.id = $1 AND es.user_id = $2`,
    [submissionId, userId]
  );
  if (!subResult.rows.length) throw { status: 403, message: 'Submission not found or access denied' };
  const sub = subResult.rows[0];

  if (!['in_progress'].includes(sub.status)) throw { status: 400, message: 'Exam is not in progress' };
  if (new Date(sub.end_datetime) < new Date()) {
    // Auto-submit on time expiry
    await submitExam(submissionId, userId, true);
    throw { status: 400, message: 'Exam time has expired - auto-submitted' };
  }

  const { selectedOption, answerText, status } = answerData;
  const answerStatus = selectedOption || answerText ? 'answered' : (status || 'unanswered');

  await query(
    `INSERT INTO submission_answers (submission_id, question_id, selected_option, answer_text, status, saved_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (submission_id, question_id)
     DO UPDATE SET selected_option = EXCLUDED.selected_option, answer_text = EXCLUDED.answer_text,
                   status = EXCLUDED.status, saved_at = NOW()`,
    [submissionId, questionId, selectedOption || null, answerText || null, answerStatus]
  );

  return { saved: true, savedAt: new Date().toISOString() };
};

// ─── Flag Question ────────────────────────────────────────────
const flagQuestion = async (submissionId, questionId, userId) => {
  await query(
    `UPDATE submission_answers SET status = 'flagged' WHERE submission_id = $1 AND question_id = $2`,
    [submissionId, questionId]
  );
};

// ─── Log Tab Switch ───────────────────────────────────────────
const logTabSwitch = async (submissionId, userId, ipAddress) => {
  const subResult = await query(
    `SELECT tab_switch_count, max_tab_switches_allowed FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.id = $1 AND es.user_id = $2 AND es.status = 'in_progress'`,
    [submissionId, userId]
  );

  if (!subResult.rows.length) return { warning: false };

  const switchCount = (subResult.rows[0].tab_switch_count || 0) + 1;
  const maxSwitches = subResult.rows[0].max_tab_switches_allowed || 3;

  await query(
    `UPDATE exam_submissions SET tab_switch_count = $1 WHERE id = $2`,
    [switchCount, submissionId]
  );
  await query(
    `INSERT INTO tab_switch_logs (submission_id, ip_address, switch_count) VALUES ($1, $2, $3)`,
    [submissionId, ipAddress, switchCount]
  );

  if (switchCount >= maxSwitches) {
    await submitExam(submissionId, userId, true, 'Auto-submitted: exceeded maximum tab switches');
    return { autoSubmitted: true, reason: 'Exceeded maximum tab switches' };
  }

  return { warning: true, switchCount, remaining: maxSwitches - switchCount };
};

// ─── Submit Exam ──────────────────────────────────────────────
const submitExam = async (submissionId, userId, isAuto = false, flagReason = null) => {
  const subResult = await query(
    `SELECT es.*, e.total_marks, e.negative_marking, e.negative_marks_factor, e.show_result_immediately,
            e.pass_marks, e.grade_scale_id
     FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.id = $1 AND es.user_id = $2`,
    [submissionId, userId]
  );
  if (!subResult.rows.length) throw { status: 403, message: 'Submission not found' };
  const sub = subResult.rows[0];

  if (['submitted', 'auto_submitted'].includes(sub.status)) {
    throw { status: 409, message: 'Exam already submitted' };
  }

  const status = isAuto ? 'auto_submitted' : 'submitted';
  const startedAt = new Date(sub.started_at);
  const timeTaken = Math.floor((new Date() - startedAt) / 1000);

  await query(
    `UPDATE exam_submissions SET status = $1, submitted_at = NOW(), time_taken_seconds = $2,
     is_flagged = $3, flag_reason = $4
     WHERE id = $5`,
    [status, timeTaken, isAuto && flagReason !== null, flagReason, submissionId]
  );

  // Auto-grade MCQ and True/False immediately
  await evaluationService.autoGrade(submissionId);

  // Send notification
  const userResult = await query(`SELECT full_name, email FROM users WHERE id = $1`, [userId]);
  if (userResult.rows.length) {
    await notificationsService.createNotification({
      recipientId: userId,
      type: 'exam_submitted',
      title: 'Exam Submitted',
      message: `Your exam has been ${isAuto ? 'automatically ' : ''}submitted. Results will be published after review.`,
    });
  }

  await auditLog({ userId, action: isAuto ? 'EXAM_AUTO_SUBMITTED' : 'EXAM_SUBMITTED', entityType: 'submission', entityId: submissionId });

  return { status, submittedAt: new Date().toISOString() };
};

// ─── Get Submission Status ────────────────────────────────────
const getSubmissionStatus = async (submissionId, userId) => {
  const result = await query(
    `SELECT sa.question_id, sa.status, sa.selected_option, sa.answer_text, sa.saved_at
     FROM submission_answers sa
     JOIN exam_submissions es ON sa.submission_id = es.id
     WHERE sa.submission_id = $1 AND es.user_id = $2`,
    [submissionId, userId]
  );

  const answers = result.rows;
  return {
    total: answers.length,
    answered: answers.filter(a => a.status === 'answered').length,
    unanswered: answers.filter(a => a.status === 'unanswered').length,
    flagged: answers.filter(a => a.status === 'flagged').length,
    answers: answers.map(a => ({ questionId: a.question_id, status: a.status, savedAt: a.saved_at })),
  };
};

module.exports = { startExam, saveAnswer, flagQuestion, logTabSwitch, submitExam, getSubmissionStatus };
