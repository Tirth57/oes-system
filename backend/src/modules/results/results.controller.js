const resultsService = require('./results.service');
const { success, error, paginated } = require('../../utils/response');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { error(res, err.message || 'Server error', err.status || 500); }
};

const getMyResults = wrap(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await resultsService.getMyResults(req.user.id, { page: parseInt(page), limit: parseInt(limit) });
  paginated(res, result.results, result.total, result.page, result.limit, 'Results retrieved');
});

const getResultDetail = wrap(async (req, res) => {
  const data = await resultsService.getResultDetail(req.params.submissionId, req.user.id, req.user.role);
  success(res, data, 'Result detail retrieved');
});

const getExamResults = wrap(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const result = await resultsService.getExamResults(req.params.examId, { page: parseInt(page), limit: parseInt(limit), search });
  paginated(res, result.results, result.total, result.page, result.limit, 'Exam results retrieved');
});

const downloadPDF = wrap(async (req, res) => {
  const buffer = await resultsService.generatePDFReport(req.params.examId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="exam_${req.params.examId}_report.pdf"`);
  res.send(buffer);
});

const downloadExcel = wrap(async (req, res) => {
  const buffer = await resultsService.generateExcelReport(req.params.examId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="exam_${req.params.examId}_report.xlsx"`);
  res.send(buffer);
});

const getAnalytics = wrap(async (req, res) => {
  const data = await resultsService.getAnalytics(req.user.id, req.user.role);
  success(res, data, 'Analytics retrieved');
});

module.exports = { getMyResults, getResultDetail, getExamResults, downloadPDF, downloadExcel, getAnalytics };
