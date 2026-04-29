const express = require('express');
const router = express.Router();
const controller = require('./conduction.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { sanitize } = require('../../middleware/validate');

router.post('/exams/:examId/start', authenticate, authorize('student'), controller.startExam);
router.get('/submissions/:submissionId/status', authenticate, controller.getSubmissionStatus);
router.put('/submissions/:submissionId/answers/:questionId', authenticate, authorize('student'), sanitize, controller.saveAnswer);
router.put('/submissions/:submissionId/flag/:questionId', authenticate, authorize('student'), controller.flagQuestion);
router.post('/submissions/:submissionId/tab-switch', authenticate, authorize('student'), controller.logTabSwitch);
router.post('/submissions/:submissionId/submit', authenticate, authorize('student'), controller.submitExam);

module.exports = router;
