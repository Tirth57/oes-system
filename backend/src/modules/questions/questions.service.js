const { query, transaction } = require('../../config/database');
const { cache } = require('../../config/redis');
const { auditLog } = require('../../utils/audit');

// ─── Subject Management ───────────────────────────────────────
const getSubjects = async ({ department, search } = {}) => {
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (department) { where += ` AND department = $${idx++}`; params.push(department); }
  if (search) { where += ` AND (name ILIKE $${idx} OR code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

  const cacheKey = `subjects:${department}:${search}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT s.*, u.full_name as created_by_name,
            (SELECT COUNT(*) FROM topics t WHERE t.subject_id = s.id) as topic_count
     FROM subjects s LEFT JOIN users u ON s.created_by = u.id
     ${where} ORDER BY s.name`,
    params
  );
  await cache.set(cacheKey, result.rows, 300);
  return result.rows;
};

const createSubject = async (data, createdBy) => {
  const { name, code, department, description } = data;
  const existing = await query(`SELECT id FROM subjects WHERE code = $1`, [code.toUpperCase()]);
  if (existing.rows.length) throw { status: 409, message: 'Subject code already exists' };

  const result = await query(
    `INSERT INTO subjects (name, code, department, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, code.toUpperCase(), department, description, createdBy]
  );
  await cache.delPattern('subjects:*');
  return result.rows[0];
};

const getTopics = async (subjectId) => {
  const result = await query(
    `SELECT * FROM topics WHERE subject_id = $1 ORDER BY name`, [subjectId]
  );
  return result.rows;
};

const createTopic = async ({ name, subjectId, description }) => {
  const result = await query(
    `INSERT INTO topics (name, subject_id, description) VALUES ($1, $2, $3) RETURNING *`,
    [name, subjectId, description]
  );
  return result.rows[0];
};

// ─── Questions ────────────────────────────────────────────────
const listQuestions = async ({ subjectId, topicId, type, difficulty, search, page = 1, limit = 20, createdBy } = {}) => {
  let where = 'WHERE q.is_active = TRUE';
  const params = [];
  let idx = 1;

  if (subjectId) { where += ` AND q.subject_id = $${idx++}`; params.push(subjectId); }
  if (topicId) { where += ` AND q.topic_id = $${idx++}`; params.push(topicId); }
  if (type) { where += ` AND q.question_type = $${idx++}`; params.push(type); }
  if (difficulty) { where += ` AND q.difficulty = $${idx++}`; params.push(difficulty); }
  if (createdBy) { where += ` AND q.created_by = $${idx++}`; params.push(createdBy); }
  if (search) { where += ` AND q.question_text ILIKE $${idx}`; params.push(`%${search}%`); idx++; }

  const offset = (page - 1) * limit;
  const countResult = await query(`SELECT COUNT(*) FROM questions q ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT q.id, q.question_text, q.question_type, q.difficulty, q.marks, q.negative_marks,
            q.subject_id, q.topic_id, q.image_url, q.usage_count, q.created_at,
            s.name as subject_name, t.name as topic_name,
            u.full_name as created_by_name,
            (SELECT json_agg(json_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text, 'isCorrect', o.is_correct, 'order', o.display_order) ORDER BY o.display_order)
             FROM question_options o WHERE o.question_id = q.id) as options
     FROM questions q
     LEFT JOIN subjects s ON q.subject_id = s.id
     LEFT JOIN topics t ON q.topic_id = t.id
     LEFT JOIN users u ON q.created_by = u.id
     ${where}
     ORDER BY q.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { questions: result.rows, total, page, limit };
};

const getQuestion = async (id) => {
  const result = await query(
    `SELECT q.*, s.name as subject_name, t.name as topic_name,
            (SELECT json_agg(json_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text, 'isCorrect', o.is_correct, 'order', o.display_order) ORDER BY o.display_order)
             FROM question_options o WHERE o.question_id = q.id) as options
     FROM questions q
     LEFT JOIN subjects s ON q.subject_id = s.id
     LEFT JOIN topics t ON q.topic_id = t.id
     WHERE q.id = $1`,
    [id]
  );
  if (!result.rows.length) throw { status: 404, message: 'Question not found' };
  return result.rows[0];
};

const createQuestion = async (data, createdBy) => {
  const {
    questionText, questionType, difficulty, subjectId, topicId,
    marks, negativeMarks, explanation, imageUrl, correctAnswer, modelAnswer, options, tags
  } = data;

  // Validate MCQ
  if (questionType === 'mcq') {
    if (!options || options.length < 2) throw { status: 400, message: 'MCQ must have at least 2 options' };
    const correctCount = options.filter(o => o.isCorrect).length;
    if (correctCount !== 1) throw { status: 400, message: 'MCQ must have exactly 1 correct answer' };
  }

  return await transaction(async (client) => {
    const qResult = await client.query(
      `INSERT INTO questions (question_text, question_type, difficulty, subject_id, topic_id, marks,
       negative_marks, explanation, image_url, correct_answer, model_answer, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [questionText, questionType, difficulty, subjectId, topicId || null, marks || 1.0,
       negativeMarks || 0, explanation, imageUrl, correctAnswer, modelAnswer, tags, createdBy]
    );
    const question = qResult.rows[0];

    if (options && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        await client.query(
          `INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [question.id, opt.text, opt.key || String.fromCharCode(65 + i), opt.isCorrect || false, i + 1]
        );
      }
    }

    await auditLog({ userId: createdBy, action: 'QUESTION_CREATED', entityType: 'question', entityId: question.id });
    return question;
  });
};

const updateQuestion = async (id, data, userId) => {
  // Check if used in active exam
  const activeUsage = await query(
    `SELECT eq.id FROM exam_questions eq
     JOIN exams e ON eq.exam_id = e.id
     WHERE eq.question_id = $1 AND e.status IN ('active', 'scheduled')`,
    [id]
  );
  if (activeUsage.rows.length) throw { status: 409, message: 'Cannot modify question used in active/scheduled exam' };

  const { questionText, difficulty, marks, negativeMarks, explanation, imageUrl, correctAnswer, modelAnswer, options, tags } = data;

  if (data.questionType === 'mcq' && options) {
    const correctCount = options.filter(o => o.isCorrect).length;
    if (correctCount !== 1) throw { status: 400, message: 'MCQ must have exactly 1 correct answer' };
  }

  return await transaction(async (client) => {
    await client.query(
      `UPDATE questions SET question_text = COALESCE($1, question_text), difficulty = COALESCE($2, difficulty),
       marks = COALESCE($3, marks), negative_marks = COALESCE($4, negative_marks),
       explanation = COALESCE($5, explanation), image_url = COALESCE($6, image_url),
       correct_answer = COALESCE($7, correct_answer), model_answer = COALESCE($8, model_answer),
       tags = COALESCE($9, tags)
       WHERE id = $10`,
      [questionText, difficulty, marks, negativeMarks, explanation, imageUrl, correctAnswer, modelAnswer, tags, id]
    );

    if (options && options.length > 0) {
      await client.query(`DELETE FROM question_options WHERE question_id = $1`, [id]);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        await client.query(
          `INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, opt.text, opt.key || String.fromCharCode(65 + i), opt.isCorrect || false, i + 1]
        );
      }
    }
    await auditLog({ userId, action: 'QUESTION_UPDATED', entityType: 'question', entityId: id });
  });
};

const deleteQuestion = async (id, userId) => {
  const activeUsage = await query(
    `SELECT eq.id FROM exam_questions eq
     JOIN exams e ON eq.exam_id = e.id
     WHERE eq.question_id = $1 AND e.status IN ('active', 'scheduled')`,
    [id]
  );
  if (activeUsage.rows.length) throw { status: 409, message: 'Cannot delete question used in active/scheduled exam' };

  await query(`UPDATE questions SET is_active = FALSE WHERE id = $1`, [id]);
  await auditLog({ userId, action: 'QUESTION_DELETED', entityType: 'question', entityId: id });
};

module.exports = {
  getSubjects, createSubject, getTopics, createTopic,
  listQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion,
};
