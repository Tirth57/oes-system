const express = require('express');
const router = express.Router();
const controller = require('./results.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const examinerAdmin = authorize('examiner', 'administrator');

router.get('/my', authenticate, authorize('student'), controller.getMyResults);
router.get('/analytics', authenticate, controller.getAnalytics);
router.get('/submissions/:submissionId', authenticate, controller.getResultDetail);
router.get('/exams/:examId', authenticate, examinerAdmin, controller.getExamResults);
router.get('/exams/:examId/pdf', authenticate, examinerAdmin, controller.downloadPDF);
router.get('/exams/:examId/excel', authenticate, examinerAdmin, controller.downloadExcel);

module.exports = router;
