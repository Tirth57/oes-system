const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { sanitize } = require('../../middleware/validate');

router.get('/', authenticate, controller.getNotifications);
router.put('/:id/read', authenticate, controller.markRead);
router.put('/mark-all-read', authenticate, controller.markAllRead);
router.post('/broadcast', authenticate, authorize('examiner', 'administrator'), sanitize, controller.broadcast);
router.get('/preferences', authenticate, controller.getPreferences);
router.put('/preferences', authenticate, sanitize, controller.updatePreferences);

module.exports = router;
