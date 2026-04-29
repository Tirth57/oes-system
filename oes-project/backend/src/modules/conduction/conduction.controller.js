const conductionService = require('./conduction.service');
const { success, error } = require('../../utils/response');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { error(res, err.message || 'Server error', err.status || 500); }
};

const startExam = wrap(async (req, res) => {
  const data = await conductionService.startExam(req.params.examId, req.user.id, req.ip, req.headers['user-agent']);
  success(res, data, 'Exam started');
});

const saveAnswer = wrap(async (req, res) => {
  const data = await conductionService.saveAnswer(req.params.submissionId, req.params.questionId, req.body, req.user.id);
  success(res, data, 'Answer saved');
});

const flagQuestion = wrap(async (req, res) => {
  await conductionService.flagQuestion(req.params.submissionId, req.params.questionId, req.user.id);
  success(res, null, 'Question flagged');
});

const logTabSwitch = wrap(async (req, res) => {
  const data = await conductionService.logTabSwitch(req.params.submissionId, req.user.id, req.ip);
  success(res, data, data.autoSubmitted ? 'Exam auto-submitted' : 'Tab switch logged');
});

const submitExam = wrap(async (req, res) => {
  const data = await conductionService.submitExam(req.params.submissionId, req.user.id, false);
  success(res, data, 'Exam submitted successfully');
});

const getSubmissionStatus = wrap(async (req, res) => {
  const data = await conductionService.getSubmissionStatus(req.params.submissionId, req.user.id);
  success(res, data, 'Status retrieved');
});

module.exports = { startExam, saveAnswer, flagQuestion, logTabSwitch, submitExam, getSubmissionStatus };
