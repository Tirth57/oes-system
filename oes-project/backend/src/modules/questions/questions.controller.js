const questionsService = require('./questions.service');
const { success, error, paginated } = require('../../utils/response');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { error(res, err.message || 'Server error', err.status || 500); }
};

// Subjects
const getSubjects = wrap(async (req, res) => {
  const data = await questionsService.getSubjects(req.query);
  success(res, data, 'Subjects retrieved');
});

const createSubject = wrap(async (req, res) => {
  const data = await questionsService.createSubject(req.body, req.user.id);
  success(res, data, 'Subject created', 201);
});

const getTopics = wrap(async (req, res) => {
  const data = await questionsService.getTopics(req.params.subjectId);
  success(res, data, 'Topics retrieved');
});

const createTopic = wrap(async (req, res) => {
  const data = await questionsService.createTopic({ ...req.body, subjectId: req.params.subjectId });
  success(res, data, 'Topic created', 201);
});

// Questions
const listQuestions = wrap(async (req, res) => {
  const { page = 1, limit = 20, ...filters } = req.query;
  // Examiners see only their own questions; admin sees all
  if (req.user.role === 'examiner') filters.createdBy = req.user.id;
  const result = await questionsService.listQuestions({ ...filters, page: parseInt(page), limit: parseInt(limit) });
  paginated(res, result.questions, result.total, result.page, result.limit, 'Questions retrieved');
});

const getQuestion = wrap(async (req, res) => {
  const data = await questionsService.getQuestion(req.params.id);
  success(res, data, 'Question retrieved');
});

const createQuestion = wrap(async (req, res) => {
  const data = await questionsService.createQuestion(req.body, req.user.id);
  success(res, data, 'Question created', 201);
});

const updateQuestion = wrap(async (req, res) => {
  await questionsService.updateQuestion(req.params.id, req.body, req.user.id);
  success(res, null, 'Question updated');
});

const deleteQuestion = wrap(async (req, res) => {
  await questionsService.deleteQuestion(req.params.id, req.user.id);
  success(res, null, 'Question deleted');
});

module.exports = { getSubjects, createSubject, getTopics, createTopic, listQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion };
