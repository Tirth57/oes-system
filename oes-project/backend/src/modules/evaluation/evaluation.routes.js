const express = require('express');
const router = express.Router();
const controller = require('./evaluation.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { sanitize } = require('../../middleware/validate');

const examinerAdmin = authorize('examiner', 'administrator');

router.get('/pending', authenticate, examinerAdmin, controller.getPendingReviews);
router.put('/answers/:answerId/grade', authenticate, examinerAdmin, sanitize, controller.gradeAnswer);
router.post('/exams/:examId/publish-results', authenticate, examinerAdmin, controller.publishResults);

module.exports = router;
