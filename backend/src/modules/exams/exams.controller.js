const examsService = require('./exams.service');
const { success, error, paginated } = require('../../utils/response');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { error(res, err.message || 'Server error', err.status || 500); }
};

const listExams = wrap(async (req, res) => {
  const { page = 1, limit = 20, ...filters } = req.query;
  if (req.user.role === 'examiner') filters.createdBy = req.user.id;
  const result = await examsService.listExams({
    ...filters, page: parseInt(page), limit: parseInt(limit),
    role: req.user.role, userId: req.user.id,
  });
  paginated(res, result.exams, result.total, result.page, result.limit, 'Exams retrieved');
});

const getExam = wrap(async (req, res) => {
  const data = await examsService.getExam(req.params.id, req.user.role, req.user.id);
  success(res, data, 'Exam retrieved');
});

const createExam = wrap(async (req, res) => {
  const data = await examsService.createExam(req.body, req.user.id);
  success(res, data, 'Exam created', 201);
});

const updateExam = wrap(async (req, res) => {
  await examsService.updateExam(req.params.id, req.body, req.user.id);
  success(res, null, 'Exam updated');
});

const publishExam = wrap(async (req, res) => {
  await examsService.publishExam(req.params.id, req.user.id);
  success(res, null, 'Exam published and students notified');
});

const cancelExam = wrap(async (req, res) => {
  await examsService.cancelExam(req.params.id, req.user.id);
  success(res, null, 'Exam cancelled');
});

const getGradeScales = wrap(async (req, res) => {
  const data = await examsService.getGradeScales();
  success(res, data, 'Grade scales retrieved');
});

const createGradeScale = wrap(async (req, res) => {
  const data = await examsService.createGradeScale(req.body, req.user.id);
  success(res, data, 'Grade scale created', 201);
});

const getExamStats = wrap(async (req, res) => {
  const data = await examsService.getExamStats(req.params.id);
  success(res, data, 'Exam statistics retrieved');
});

module.exports = { listExams, getExam, createExam, updateExam, publishExam, cancelExam, getGradeScales, createGradeScale, getExamStats };
