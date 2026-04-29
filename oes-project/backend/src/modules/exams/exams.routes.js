const express = require('express');
const router = express.Router();
const controller = require('./exams.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { sanitize } = require('../../middleware/validate');

const examinerAdmin = authorize('examiner', 'administrator');

// Grade Scales
router.get('/grade-scales', authenticate, controller.getGradeScales);
router.post('/grade-scales', authenticate, authorize('administrator'), sanitize, controller.createGradeScale);

// Exams
router.get('/', authenticate, controller.listExams);
router.post('/', authenticate, examinerAdmin, sanitize, controller.createExam);
router.get('/:id', authenticate, controller.getExam);
router.put('/:id', authenticate, examinerAdmin, sanitize, controller.updateExam);
router.post('/:id/publish', authenticate, examinerAdmin, controller.publishExam);
router.post('/:id/cancel', authenticate, examinerAdmin, controller.cancelExam);
router.get('/:id/stats', authenticate, examinerAdmin, controller.getExamStats);

module.exports = router;
