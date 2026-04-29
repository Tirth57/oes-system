const { query, transaction } = require('../../config/database');
const notificationsService = require('../notifications/notifications.service');

// ─── Auto-Grade MCQ and True/False ───────────────────────────
const autoGrade = async (submissionId) => {
  const answersResult = await query(
    `SELECT sa.id, sa.question_id, sa.selected_option, sa.answer_text, sa.status,
            q.question_type, q.correct_answer, q.marks, q.negative_marks
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     WHERE sa.submission_id = $1 AND sa.is_auto_graded = FALSE
       AND q.question_type IN ('mcq', 'true_false')`,
    [submissionId]
  );

  const examInfo = await query(
    `SELECT e.negative_marking, e.negative_marks_factor, e.grade_scale_id, e.pass_marks, e.total_marks,
            es.user_id
     FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.id = $1`,
    [submissionId]
  );

  if (!examInfo.rows.length) return;
  const { negative_marking, negative_marks_factor, grade_scale_id, pass_marks, total_marks, user_id } = examInfo.rows[0];

  let autoGradingDone = true;

  for (const answer of answersResult.rows) {
    const isCorrect = checkAnswer(answer);
    let marksObtained = 0;

    if (isCorrect) {
      marksObtained = parseFloat(answer.marks);
    } else if (negative_marking && answer.selected_option) {
      marksObtained = -(parseFloat(answer.marks) * parseFloat(negative_marks_factor || 0.25));
    }

    await query(
      `UPDATE submission_answers SET is_correct = $1, marks_obtained = $2, is_auto_graded = TRUE, status = $3
       WHERE id = $4`,
      [isCorrect, marksObtained, answer.status === 'unanswered' ? 'unanswered' : 'answered', answer.id]
    );
  }

  // Check if any short answers remain (need manual review)
  const pendingShortAnswers = await query(
    `SELECT COUNT(*) FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     WHERE sa.submission_id = $1 AND q.question_type = 'short_answer' AND sa.reviewed_by IS NULL`,
    [submissionId]
  );
  const hasShortAnswers = parseInt(pendingShortAnswers.rows[0].count) > 0;

  if (!hasShortAnswers) {
    // Finalize result
    await finalizeResult(submissionId, grade_scale_id, pass_marks, total_marks, user_id);
  } else {
    // Update partial score
    await updatePartialScore(submissionId);
  }
};

const checkAnswer = (answer) => {
  const given = (answer.selected_option || answer.answer_text || '').toString().trim().toLowerCase();
  const correct = (answer.correct_answer || '').toString().trim().toLowerCase();
  return given === correct;
};

// ─── Manual Review: List pending short answers ────────────────
const getPendingReviews = async (examinerId, { examId, page = 1, limit = 20 } = {}) => {
  let where = `WHERE q.question_type = 'short_answer' AND sa.reviewed_by IS NULL AND sa.status = 'answered'`;
  const params = [];
  let idx = 1;

  if (examId) { where += ` AND e.id = $${idx++}`; params.push(examId); }

  // Only show exams created by this examiner
  where += ` AND e.created_by = $${idx++}`;
  params.push(examinerId);

  const offset = (page - 1) * limit;
  const countResult = await query(
    `SELECT COUNT(*) FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     JOIN exam_submissions es ON sa.submission_id = es.id
     JOIN exams e ON es.exam_id = e.id ${where}`,
    params
  );

  const result = await query(
    `SELECT sa.id as answer_id, sa.submission_id, sa.answer_text, sa.status,
            q.id as question_id, q.question_text, q.marks, q.model_answer, q.correct_answer,
            u.full_name as student_name, u.enrollment_number,
            e.title as exam_title, e.id as exam_id
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     JOIN exam_submissions es ON sa.submission_id = es.id
     JOIN users u ON es.user_id = u.id
     JOIN exams e ON es.exam_id = e.id
     ${where}
     ORDER BY e.id, u.full_name
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { reviews: result.rows, total: parseInt(countResult.rows[0].count), page, limit };
};

// ─── Submit Manual Grade ──────────────────────────────────────
const gradeShortAnswer = async (answerId, marksObtained, reviewNotes, examinerId) => {
  const answerResult = await query(
    `SELECT sa.*, q.marks as max_marks, es.user_id, e.grade_scale_id, e.pass_marks, e.total_marks, e.created_by
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     JOIN exam_submissions es ON sa.submission_id = es.id
     JOIN exams e ON es.exam_id = e.id
     WHERE sa.id = $1`,
    [answerId]
  );
  if (!answerResult.rows.length) throw { status: 404, message: 'Answer not found' };
  const answer = answerResult.rows[0];

  if (answer.created_by !== examinerId) throw { status: 403, message: 'Not authorized to grade this answer' };
  if (marksObtained < 0 || marksObtained > parseFloat(answer.max_marks)) {
    throw { status: 400, message: `Marks must be between 0 and ${answer.max_marks}` };
  }

  await query(
    `UPDATE submission_answers SET marks_obtained = $1, review_notes = $2, reviewed_by = $3,
     reviewed_at = NOW(), is_auto_graded = FALSE, is_correct = $4
     WHERE id = $5`,
    [marksObtained, reviewNotes, examinerId, marksObtained > 0, answerId]
  );

  // Check if all short answers are reviewed
  const remaining = await query(
    `SELECT COUNT(*) FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     WHERE sa.submission_id = $1 AND q.question_type = 'short_answer'
       AND sa.reviewed_by IS NULL AND sa.status = 'answered'`,
    [answer.submission_id]
  );

  if (parseInt(remaining.rows[0].count) === 0) {
    await finalizeResult(answer.submission_id, answer.grade_scale_id, answer.pass_marks, answer.total_marks, answer.user_id);
  } else {
    await updatePartialScore(answer.submission_id);
  }
};

// ─── Finalize Result ──────────────────────────────────────────
const finalizeResult = async (submissionId, gradeScaleId, passMarks, totalMarks, userId) => {
  // Sum all marks
  const scoreResult = await query(
    `SELECT COALESCE(SUM(marks_obtained), 0) as total FROM submission_answers WHERE submission_id = $1`,
    [submissionId]
  );
  const totalScore = Math.max(0, parseFloat(scoreResult.rows[0].total));
  const percentage = (totalScore / parseFloat(totalMarks)) * 100;
  const isPassed = totalScore >= parseFloat(passMarks);

  // Determine grade
  let grade = 'N/A';
  if (gradeScaleId) {
    const gradeResult = await query(
      `SELECT grade_label FROM grade_scale_ranges
       WHERE scale_id = $1 AND $2 >= min_percentage AND $2 <= max_percentage
       LIMIT 1`,
      [gradeScaleId, percentage]
    );
    if (gradeResult.rows.length) grade = gradeResult.rows[0].grade_label;
  }

  await query(
    `UPDATE exam_submissions SET total_score = $1, percentage = $2, grade = $3, is_passed = $4 WHERE id = $5`,
    [totalScore, percentage.toFixed(2), grade, isPassed, submissionId]
  );

  // Notify student
  const subResult = await query(`SELECT exam_id FROM exam_submissions WHERE id = $1`, [submissionId]);
  if (subResult.rows.length) {
    const examResult = await query(`SELECT title FROM exams WHERE id = $1`, [subResult.rows[0].exam_id]);
    const title = examResult.rows.length ? examResult.rows[0].title : 'Exam';
    await notificationsService.createNotification({
      recipientId: userId,
      type: 'result_published',
      title: 'Your Result is Ready',
      message: `Your result for "${title}" has been finalized. Score: ${totalScore.toFixed(2)}/${totalMarks} (${percentage.toFixed(1)}%) — Grade: ${grade}`,
    });
  }
};

const updatePartialScore = async (submissionId) => {
  const scoreResult = await query(
    `SELECT COALESCE(SUM(marks_obtained), 0) as total FROM submission_answers WHERE submission_id = $1`,
    [submissionId]
  );
  await query(
    `UPDATE exam_submissions SET total_score = $1 WHERE id = $2`,
    [Math.max(0, parseFloat(scoreResult.rows[0].total)), submissionId]
  );
};

// ─── Publish All Results for an Exam ─────────────────────────
const publishExamResults = async (examId, examinerId) => {
  await query(
    `UPDATE exams SET result_published = TRUE, result_published_at = NOW() WHERE id = $1`,
    [examId]
  );

  // Get all students with submissions
  const subs = await query(
    `SELECT es.user_id, es.total_score, es.percentage, es.grade, e.title
     FROM exam_submissions es JOIN exams e ON es.exam_id = e.id
     WHERE es.exam_id = $1 AND es.status IN ('submitted', 'auto_submitted')`,
    [examId]
  );

  for (const sub of subs.rows) {
    await notificationsService.createNotification({
      recipientId: sub.user_id,
      senderId: examinerId,
      type: 'result_published',
      title: `Results Published: ${sub.title}`,
      message: `Results for "${sub.title}" have been published. Score: ${sub.total_score} | ${sub.percentage}% | Grade: ${sub.grade}`,
      relatedExamId: examId,
    });
  }
};

module.exports = { autoGrade, getPendingReviews, gradeShortAnswer, finalizeResult, publishExamResults };
