const { query } = require('../../config/database');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

// ─── Student: My Results ──────────────────────────────────────
const getMyResults = async (userId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const countResult = await query(
    `SELECT COUNT(*) FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.user_id = $1 AND es.status IN ('submitted', 'auto_submitted') AND e.result_published = TRUE`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT es.id, es.total_score, es.percentage, es.grade, es.is_passed, es.submitted_at,
            es.time_taken_seconds, es.is_flagged, es.status,
            e.id as exam_id, e.title, e.total_marks, e.pass_marks, e.subject_id,
            s.name as subject_name, e.start_datetime
     FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     LEFT JOIN subjects s ON e.subject_id = s.id
     WHERE es.user_id = $1 AND es.status IN ('submitted', 'auto_submitted') AND e.result_published = TRUE
     ORDER BY es.submitted_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { results: result.rows, total, page, limit };
};

// ─── Student: Detailed Result ─────────────────────────────────
const getResultDetail = async (submissionId, userId, role) => {
  const subResult = await query(
    `SELECT es.*, e.title, e.total_marks, e.pass_marks, e.result_published,
            s.name as subject_name
     FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     LEFT JOIN subjects s ON e.subject_id = s.id
     WHERE es.id = $1`,
    [submissionId]
  );
  if (!subResult.rows.length) throw { status: 404, message: 'Submission not found' };
  const sub = subResult.rows[0];

  // Access control
  if (role === 'student') {
    if (sub.user_id !== userId) throw { status: 403, message: 'Access denied' };
    if (!sub.result_published) throw { status: 403, message: 'Results not yet published' };
  }

  const answersResult = await query(
    `SELECT sa.id, sa.question_id, sa.selected_option, sa.answer_text, sa.status,
            sa.is_correct, sa.marks_obtained, sa.review_notes, sa.is_auto_graded,
            q.question_text, q.question_type, q.correct_answer, q.marks as max_marks,
            q.explanation, q.model_answer,
            (SELECT json_agg(json_build_object('key', o.option_key, 'text', o.option_text, 'isCorrect', o.is_correct) ORDER BY o.display_order)
             FROM question_options o WHERE o.question_id = q.id) as options
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     WHERE sa.submission_id = $1
     ORDER BY q.question_text`,
    [submissionId]
  );

  return { ...sub, answers: answersResult.rows };
};

// ─── Examiner: All Results for an Exam ───────────────────────
const getExamResults = async (examId, { page = 1, limit = 20, search } = {}) => {
  let where = `WHERE es.exam_id = $1 AND es.status IN ('submitted', 'auto_submitted')`;
  const params = [examId];
  let idx = 2;

  if (search) {
    where += ` AND (u.full_name ILIKE $${idx} OR u.enrollment_number ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }

  const offset = (page - 1) * limit;
  const countResult = await query(`SELECT COUNT(*) FROM exam_submissions es JOIN users u ON es.user_id = u.id ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT es.id as submission_id, es.total_score, es.percentage, es.grade, es.is_passed,
            es.submitted_at, es.time_taken_seconds, es.tab_switch_count, es.is_flagged, es.status,
            u.id as user_id, u.full_name, u.enrollment_number, u.batch, u.department
     FROM exam_submissions es
     JOIN users u ON es.user_id = u.id
     ${where}
     ORDER BY es.percentage DESC NULLS LAST
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { results: result.rows, total, page, limit };
};

// ─── Generate PDF Report ──────────────────────────────────────
const generatePDFReport = async (examId) => {
  const examResult = await query(
    `SELECT e.*, s.name as subject_name FROM exams e LEFT JOIN subjects s ON e.subject_id = s.id WHERE e.id = $1`,
    [examId]
  );
  if (!examResult.rows.length) throw { status: 404, message: 'Exam not found' };
  const exam = examResult.rows[0];

  const resultsResult = await query(
    `SELECT u.full_name, u.enrollment_number, u.batch, u.department,
            es.total_score, es.percentage, es.grade, es.is_passed, es.submitted_at, es.tab_switch_count
     FROM exam_submissions es
     JOIN users u ON es.user_id = u.id
     WHERE es.exam_id = $1 AND es.status IN ('submitted', 'auto_submitted')
     ORDER BY es.percentage DESC`,
    [examId]
  );
  const results = resultsResult.rows;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50 });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Online Examination System', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).text(`Exam Report: ${exam.title}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica')
      .text(`Subject: ${exam.subject_name}   |   Total Marks: ${exam.total_marks}   |   Pass Marks: ${exam.pass_marks}`, { align: 'center' });
    doc.text(`Date: ${new Date(exam.start_datetime).toLocaleDateString('en-IN')}   |   Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
    doc.moveDown(1);

    // Statistics
    const scores = results.map(r => parseFloat(r.percentage) || 0);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
    const passed = results.filter(r => r.is_passed).length;

    doc.fontSize(13).font('Helvetica-Bold').text('Summary Statistics');
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Students: ${results.length}   |   Passed: ${passed}   |   Failed: ${results.length - passed}`);
    doc.text(`Average Score: ${avg}%   |   Highest: ${Math.max(...scores, 0).toFixed(1)}%   |   Lowest: ${Math.min(...scores, 100).toFixed(1)}%`);
    doc.moveDown(1);

    // Table header
    doc.fontSize(12).font('Helvetica-Bold').text('Student Results');
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const headers = ['#', 'Student Name', 'Enrollment', 'Score', '%', 'Grade', 'Status'];
    const widths = [30, 150, 100, 60, 60, 50, 60];
    let x = 50;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.rect(45, tableTop - 5, 520, 20).fill('#667eea');
    doc.fill('white');
    headers.forEach((h, i) => {
      doc.text(h, x, tableTop, { width: widths[i] });
      x += widths[i];
    });

    doc.fill('black').font('Helvetica').fontSize(9);
    results.forEach((r, idx) => {
      const y = doc.y + 5;
      if (y > 720) { doc.addPage(); }
      x = 50;
      if (idx % 2 === 0) doc.rect(45, y - 3, 520, 18).fill('#f0f4ff');
      doc.fill('black');
      const row = [idx + 1, r.full_name, r.enrollment_number || 'N/A',
        `${r.total_score || 0}`, `${parseFloat(r.percentage || 0).toFixed(1)}%`,
        r.grade || 'N/A', r.is_passed ? 'Pass' : 'Fail'];
      row.forEach((cell, i) => {
        doc.text(String(cell), x, y, { width: widths[i] });
        x += widths[i];
      });
      doc.moveDown(0.2);
    });

    doc.end();
  });
};

// ─── Generate Excel Report ────────────────────────────────────
const generateExcelReport = async (examId) => {
  const examResult = await query(
    `SELECT e.*, s.name as subject_name FROM exams e LEFT JOIN subjects s ON e.subject_id = s.id WHERE e.id = $1`,
    [examId]
  );
  if (!examResult.rows.length) throw { status: 404, message: 'Exam not found' };
  const exam = examResult.rows[0];

  const results = await query(
    `SELECT u.full_name as "Student Name", u.enrollment_number as "Enrollment No",
            u.batch as "Batch", u.department as "Department",
            es.total_score as "Total Score", exam_total.total_marks as "Max Marks",
            es.percentage as "Percentage", es.grade as "Grade",
            CASE WHEN es.is_passed THEN 'Pass' ELSE 'Fail' END as "Result",
            es.submitted_at as "Submitted At", es.time_taken_seconds as "Time Taken (sec)",
            es.tab_switch_count as "Tab Switches", CASE WHEN es.is_flagged THEN 'Yes' ELSE 'No' END as "Flagged"
     FROM exam_submissions es
     JOIN users u ON es.user_id = u.id
     JOIN exams exam_total ON es.exam_id = exam_total.id
     WHERE es.exam_id = $1 AND es.status IN ('submitted', 'auto_submitted')
     ORDER BY es.percentage DESC`,
    [examId]
  );

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Online Examination System - Exam Report'],
    [''],
    ['Exam Title', exam.title],
    ['Subject', exam.subject_name],
    ['Date', new Date(exam.start_datetime).toLocaleDateString()],
    ['Total Marks', exam.total_marks],
    ['Pass Marks', exam.pass_marks],
    ['Total Students', results.rows.length],
    ['Passed', results.rows.filter(r => r['Result'] === 'Pass').length],
    ['Failed', results.rows.filter(r => r['Result'] === 'Fail').length],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Results sheet
  const ws = XLSX.utils.json_to_sheet(results.rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Student Results');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ─── Analytics ────────────────────────────────────────────────
const getAnalytics = async (userId, role) => {
  let examFilter = role === 'examiner' ? `AND e.created_by = '${userId}'` : '';

  const overallStats = await query(
    `SELECT COUNT(DISTINCT es.exam_id) as total_exams,
            COUNT(es.id) as total_submissions,
            ROUND(AVG(es.percentage), 1) as avg_percentage,
            COUNT(CASE WHEN es.is_passed THEN 1 END) as total_passed
     FROM exam_submissions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.status IN ('submitted', 'auto_submitted') ${examFilter}`
  );

  const topicPerformance = await query(
    `SELECT t.name as topic, ROUND(AVG(sa.marks_obtained / q.marks * 100), 1) as avg_score
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     JOIN topics t ON q.topic_id = t.id
     JOIN exam_submissions es ON sa.submission_id = es.id
     JOIN exams e ON es.exam_id = e.id
     WHERE sa.is_auto_graded = TRUE ${examFilter}
     GROUP BY t.name ORDER BY avg_score DESC LIMIT 10`
  );

  const difficultyPerformance = await query(
    `SELECT q.difficulty,
            ROUND(AVG(CASE WHEN sa.is_correct THEN 100 ELSE 0 END), 1) as accuracy
     FROM submission_answers sa
     JOIN questions q ON sa.question_id = q.id
     JOIN exam_submissions es ON sa.submission_id = es.id
     JOIN exams e ON es.exam_id = e.id
     WHERE sa.is_auto_graded = TRUE ${examFilter}
     GROUP BY q.difficulty`
  );

  const recentExams = await query(
    `SELECT e.title, e.start_datetime,
            COUNT(es.id) as submissions,
            ROUND(AVG(es.percentage), 1) as avg_percentage
     FROM exams e
     LEFT JOIN exam_submissions es ON es.exam_id = e.id
     WHERE e.status IN ('completed', 'active') ${examFilter}
     GROUP BY e.id ORDER BY e.start_datetime DESC LIMIT 5`
  );

  return {
    overall: overallStats.rows[0],
    topicPerformance: topicPerformance.rows,
    difficultyPerformance: difficultyPerformance.rows,
    recentExams: recentExams.rows,
  };
};

module.exports = { getMyResults, getResultDetail, getExamResults, generatePDFReport, generateExcelReport, getAnalytics };
