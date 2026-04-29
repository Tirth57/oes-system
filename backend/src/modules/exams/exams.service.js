const { query, transaction } = require('../../config/database');
const { cache } = require('../../config/redis');
const { auditLog } = require('../../utils/audit');
const notificationsService = require('../notifications/notifications.service');

// ─── Create Exam ──────────────────────────────────────────────
const createExam = async (data, createdBy) => {
  const {
    title, subjectId, description, instructions, startDatetime, endDatetime,
    durationMinutes, totalMarks, passMarks, gradeScaleId, allowNavigation, shuffleQuestions,
    shuffleOptions, uniqueQuestionSet, showResultImmediately, negativeMarking,
    negativeMarksFactor, maxTabSwitches, questionSelectionType, targetBatch, targetAllStudents,
    questions: questionIds, randomCriteria,
  } = data;

  // Validate dates
  const start = new Date(startDatetime);
  const end = new Date(endDatetime);
  if (start <= new Date()) throw { status: 400, message: 'Start datetime must be in the future' };
  if (end <= start) throw { status: 400, message: 'End datetime must be after start datetime' };
  if (passMarks > totalMarks) throw { status: 400, message: 'Pass marks cannot exceed total marks' };

  return await transaction(async (client) => {
    const examResult = await client.query(
      `INSERT INTO exams (title, subject_id, description, instructions, start_datetime, end_datetime,
       duration_minutes, total_marks, pass_marks, created_by, grade_scale_id, allow_navigation,
       shuffle_questions, shuffle_options, unique_question_set, show_result_immediately,
       negative_marking, negative_marks_factor, max_tab_switches, question_selection_type,
       target_batch, target_all_students)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [title, subjectId, description, instructions, startDatetime, endDatetime, durationMinutes,
       totalMarks, passMarks, createdBy, gradeScaleId || null, allowNavigation !== false,
       shuffleQuestions || false, shuffleOptions || false, uniqueQuestionSet || false,
       showResultImmediately || false, negativeMarking || false, negativeMarksFactor || 0.25,
       maxTabSwitches || 3, questionSelectionType || 'manual', targetBatch || null,
       targetAllStudents !== false]
    );
    const exam = examResult.rows[0];

    // Attach questions (manual selection)
    if (questionSelectionType === 'manual' && questionIds && questionIds.length > 0) {
      for (let i = 0; i < questionIds.length; i++) {
        await client.query(
          `INSERT INTO exam_questions (exam_id, question_id, display_order) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [exam.id, questionIds[i], i + 1]
        );
        // Increment usage count
        await client.query(`UPDATE questions SET usage_count = usage_count + 1 WHERE id = $1`, [questionIds[i]]);
      }
    }

    // Random criteria
    if (questionSelectionType === 'random' && randomCriteria && randomCriteria.length > 0) {
      for (const criteria of randomCriteria) {
        await client.query(
          `INSERT INTO exam_random_criteria (exam_id, difficulty, count, subject_id, topic_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [exam.id, criteria.difficulty, criteria.count, criteria.subjectId || subjectId, criteria.topicId || null]
        );
      }
    }

    await auditLog({ userId: createdBy, action: 'EXAM_CREATED', entityType: 'exam', entityId: exam.id });
    return exam;
  });
};

// ─── Get Exams ────────────────────────────────────────────────
const listExams = async ({ status, subjectId, search, page = 1, limit = 20, createdBy, role, userId } = {}) => {
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  if (status) { where += ` AND e.status = $${idx++}`; params.push(status); }
  if (subjectId) { where += ` AND e.subject_id = $${idx++}`; params.push(subjectId); }
  if (search) { where += ` AND e.title ILIKE $${idx}`; params.push(`%${search}%`); idx++; }
  if (createdBy) { where += ` AND e.created_by = $${idx++}`; params.push(createdBy); }

  // Students only see published, non-draft exams
  if (role === 'student') {
    where += ` AND e.is_published = TRUE AND e.status != 'draft'`;
  }

  const offset = (page - 1) * limit;
  const countResult = await query(`SELECT COUNT(*) FROM exams e ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT e.*, s.name as subject_name, u.full_name as created_by_name,
            (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as question_count
            ${role === 'student' ? `, (SELECT id FROM exam_submissions es WHERE es.exam_id = e.id AND es.user_id = $${idx + 2}) as submission_id,
               (SELECT status FROM exam_submissions es WHERE es.exam_id = e.id AND es.user_id = $${idx + 3}) as submission_status` : ''}
     FROM exams e
     LEFT JOIN subjects s ON e.subject_id = s.id
     LEFT JOIN users u ON e.created_by = u.id
     ${where}
     ORDER BY e.start_datetime DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    role === 'student'
      ? [...params, limit, offset, userId, userId]
      : [...params, limit, offset]
  );

  return { exams: result.rows, total, page, limit };
};

const getExam = async (id, role, userId) => {
  const result = await query(
    `SELECT e.*, s.name as subject_name, u.full_name as created_by_name,
            g.name as grade_scale_name,
            (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as question_count
     FROM exams e
     LEFT JOIN subjects s ON e.subject_id = s.id
     LEFT JOIN users u ON e.created_by = u.id
     LEFT JOIN grade_scales g ON e.grade_scale_id = g.id
     WHERE e.id = $1`,
    [id]
  );
  if (!result.rows.length) throw { status: 404, message: 'Exam not found' };

  const exam = result.rows[0];

  // Get questions (hide correct answers for students during active exam)
  const questionsResult = await query(
    `SELECT eq.display_order, q.id, q.question_text, q.question_type, q.difficulty,
            q.marks, q.image_url,
            ${role !== 'student' ? `q.correct_answer, q.model_answer, q.explanation,` : ''}
            (SELECT json_agg(json_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text
            ${role !== 'student' ? `,'isCorrect', o.is_correct` : ''}) ORDER BY o.display_order)
             FROM question_options o WHERE o.question_id = q.id) as options
     FROM exam_questions eq
     JOIN questions q ON eq.question_id = q.id
     WHERE eq.exam_id = $1
     ORDER BY eq.display_order`,
    [id]
  );
  exam.questions = questionsResult.rows;

  return exam;
};

const updateExam = async (id, data, userId) => {
  const examResult = await query(`SELECT status, start_datetime FROM exams WHERE id = $1`, [id]);
  if (!examResult.rows.length) throw { status: 404, message: 'Exam not found' };
  const exam = examResult.rows[0];

  if (['active', 'completed', 'cancelled'].includes(exam.status)) {
    throw { status: 409, message: 'Cannot edit exam that is active, completed, or cancelled' };
  }
  if (new Date(exam.start_datetime) <= new Date()) {
    throw { status: 409, message: 'Cannot edit exam after start time' };
  }

  const { title, description, instructions, startDatetime, endDatetime, durationMinutes, passMarks, totalMarks } = data;

  await query(
    `UPDATE exams SET title = COALESCE($1, title), description = COALESCE($2, description),
     instructions = COALESCE($3, instructions), start_datetime = COALESCE($4, start_datetime),
     end_datetime = COALESCE($5, end_datetime), duration_minutes = COALESCE($6, duration_minutes),
     pass_marks = COALESCE($7, pass_marks), total_marks = COALESCE($8, total_marks)
     WHERE id = $9`,
    [title, description, instructions, startDatetime, endDatetime, durationMinutes, passMarks, totalMarks, id]
  );

  // Notify enrolled students of changes
  const students = await query(
    `SELECT u.id, u.full_name FROM users u WHERE u.role = 'student' AND u.status = 'active'`
  );
  for (const student of students.rows) {
    await notificationsService.createNotification({
      recipientId: student.id,
      senderId: userId,
      type: 'exam_scheduled',
      title: 'Exam Updated',
      message: `The exam "${title || 'an exam'}" has been updated. Please check the new details.`,
      relatedExamId: id,
    });
  }

  await auditLog({ userId, action: 'EXAM_UPDATED', entityType: 'exam', entityId: id });
};

const publishExam = async (id, userId) => {
  const examResult = await query(`SELECT * FROM exams WHERE id = $1`, [id]);
  if (!examResult.rows.length) throw { status: 404, message: 'Exam not found' };
  const exam = examResult.rows[0];

  const qCount = await query(`SELECT COUNT(*) FROM exam_questions WHERE exam_id = $1`, [id]);
  if (parseInt(qCount.rows[0].count) === 0) throw { status: 400, message: 'Exam must have at least one question' };

  await query(`UPDATE exams SET is_published = TRUE, status = 'scheduled' WHERE id = $1`, [id]);

  // Notify all active students
  const students = await query(`SELECT id FROM users WHERE role = 'student' AND status = 'active'`);
  for (const student of students.rows) {
    await notificationsService.createNotification({
      recipientId: student.id,
      senderId: userId,
      type: 'exam_scheduled',
      title: 'New Exam Scheduled',
      message: `A new exam "${exam.title}" has been scheduled. Check your dashboard for details.`,
      relatedExamId: id,
    });
  }

  await auditLog({ userId, action: 'EXAM_PUBLISHED', entityType: 'exam', entityId: id });
};

const cancelExam = async (id, userId) => {
  await query(`UPDATE exams SET status = 'cancelled' WHERE id = $1`, [id]);
  await auditLog({ userId, action: 'EXAM_CANCELLED', entityType: 'exam', entityId: id });
};

// ─── Grade Scales ─────────────────────────────────────────────
const getGradeScales = async () => {
  const result = await query(
    `SELECT g.*, json_agg(json_build_object('id', r.id, 'grade', r.grade_label, 'min', r.min_percentage, 'max', r.max_percentage, 'description', r.description) ORDER BY r.min_percentage DESC) as ranges
     FROM grade_scales g
     LEFT JOIN grade_scale_ranges r ON r.scale_id = g.id
     GROUP BY g.id ORDER BY g.is_default DESC, g.name`
  );
  return result.rows;
};

const createGradeScale = async (data, userId) => {
  const { name, ranges, isDefault } = data;

  // Validate non-overlapping ranges
  const sorted = [...ranges].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i - 1].max) throw { status: 400, message: 'Grade ranges must not overlap' };
  }

  return await transaction(async (client) => {
    if (isDefault) await client.query(`UPDATE grade_scales SET is_default = FALSE`);
    const result = await client.query(
      `INSERT INTO grade_scales (name, created_by, is_default) VALUES ($1, $2, $3) RETURNING *`,
      [name, userId, isDefault || false]
    );
    const scale = result.rows[0];
    for (const r of ranges) {
      await client.query(
        `INSERT INTO grade_scale_ranges (scale_id, grade_label, min_percentage, max_percentage, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [scale.id, r.grade, r.min, r.max, r.description || null]
      );
    }
    return scale;
  });
};

// ─── Exam Statistics ──────────────────────────────────────────
const getExamStats = async (examId) => {
  const submissions = await query(
    `SELECT es.total_score, es.percentage, es.grade, es.is_passed, es.status
     FROM exam_submissions es WHERE es.exam_id = $1 AND es.status IN ('submitted', 'auto_submitted')`,
    [examId]
  );
  const rows = submissions.rows;
  if (!rows.length) return { total: 0, submitted: 0, passed: 0, average: 0, highest: 0, lowest: 0 };

  const scores = rows.map(r => parseFloat(r.percentage) || 0);
  const passed = rows.filter(r => r.is_passed).length;

  // Distribution
  const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
  scores.forEach(s => {
    if (s <= 20) distribution['0-20']++;
    else if (s <= 40) distribution['21-40']++;
    else if (s <= 60) distribution['41-60']++;
    else if (s <= 80) distribution['61-80']++;
    else distribution['81-100']++;
  });

  return {
    total: rows.length,
    submitted: rows.length,
    passed,
    failed: rows.length - passed,
    passRate: ((passed / rows.length) * 100).toFixed(1),
    average: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
    highest: Math.max(...scores).toFixed(2),
    lowest: Math.min(...scores).toFixed(2),
    distribution,
    gradeDistribution: rows.reduce((acc, r) => {
      if (r.grade) acc[r.grade] = (acc[r.grade] || 0) + 1;
      return acc;
    }, {}),
  };
};

module.exports = {
  createExam, listExams, getExam, updateExam, publishExam, cancelExam,
  getGradeScales, createGradeScale, getExamStats,
};
