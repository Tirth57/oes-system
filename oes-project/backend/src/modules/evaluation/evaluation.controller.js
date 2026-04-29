const evaluationService = require('./evaluation.service');
const { success, error, paginated } = require('../../utils/response');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { error(res, err.message || 'Server error', err.status || 500); }
};

const getPendingReviews = wrap(async (req, res) => {
  const { page = 1, limit = 20, examId } = req.query;
  const result = await evaluationService.getPendingReviews(req.user.id, { examId, page: parseInt(page), limit: parseInt(limit) });
  paginated(res, result.reviews, result.total, result.page, result.limit, 'Pending reviews retrieved');
});

const gradeAnswer = wrap(async (req, res) => {
  const { marksObtained, reviewNotes } = req.body;
  if (marksObtained === undefined) throw { status: 400, message: 'Marks obtained is required' };
  await evaluationService.gradeShortAnswer(req.params.answerId, parseFloat(marksObtained), reviewNotes, req.user.id);
  success(res, null, 'Answer graded successfully');
});

const publishResults = wrap(async (req, res) => {
  await evaluationService.publishExamResults(req.params.examId, req.user.id);
  success(res, null, 'Results published');
});

module.exports = { getPendingReviews, gradeAnswer, publishResults };
