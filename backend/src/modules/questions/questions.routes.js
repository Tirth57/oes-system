const express = require('express');
const router = express.Router();
const controller = require('./questions.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { sanitize } = require('../../middleware/validate');

const examinerAdmin = authorize('examiner', 'administrator');

// Subjects
router.get('/subjects', authenticate, controller.getSubjects);
router.post('/subjects', authenticate, examinerAdmin, sanitize, controller.createSubject);
router.get('/subjects/:subjectId/topics', authenticate, controller.getTopics);
router.post('/subjects/:subjectId/topics', authenticate, examinerAdmin, sanitize, controller.createTopic);

// Questions
/**
 * @swagger
 * /api/questions:
 *   get:
 *     summary: List questions with filters
 *     tags: [Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: subjectId
 *         schema: { type: string }
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [easy, medium, hard] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [mcq, true_false, short_answer] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 */
router.get('/', authenticate, examinerAdmin, controller.listQuestions);
router.get('/:id', authenticate, examinerAdmin, controller.getQuestion);
router.post('/', authenticate, examinerAdmin, sanitize, controller.createQuestion);
router.put('/:id', authenticate, examinerAdmin, sanitize, controller.updateQuestion);
router.delete('/:id', authenticate, examinerAdmin, controller.deleteQuestion);

module.exports = router;
