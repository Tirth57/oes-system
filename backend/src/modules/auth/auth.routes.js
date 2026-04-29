const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimiter');
const { validate, sanitize } = require('../../middleware/validate');
const {
  registerValidator, loginValidator, forgotPasswordValidator,
  resetPasswordValidator, changePasswordValidator,
} = require('./auth.validators');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and account management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new student account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               fullName: { type: string }
 *               enrollmentNumber: { type: string }
 *               department: { type: string }
 *               contact: { type: string }
 *               batch: { type: string }
 *     responses:
 *       201: { description: Registration successful }
 *       409: { description: Email or enrollment number already exists }
 */
router.post('/register', sanitize, registerValidator, validate, controller.register);

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify email with token
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Email verified }
 */
router.get('/verify-email', controller.verifyEmail);
router.post('/verify-email', controller.verifyEmail);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and get JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns JWT }
 *       401: { description: Invalid credentials }
 *       403: { description: Account locked }
 */
router.post('/login', authLimiter, sanitize, loginValidator, validate, controller.login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and invalidate token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', authenticate, controller.logout);

router.post('/refresh-token', controller.refreshToken);
router.post('/forgot-password', authLimiter, sanitize, forgotPasswordValidator, validate, controller.forgotPassword);
router.post('/reset-password', sanitize, resetPasswordValidator, validate, controller.resetPassword);

// Protected profile routes
router.get('/profile', authenticate, controller.getProfile);
router.put('/profile', authenticate, sanitize, controller.updateProfile);
router.put('/change-password', authenticate, sanitize, changePasswordValidator, validate, controller.changePassword);

// Admin-only user management
router.get('/users', authenticate, authorize('administrator'), controller.listUsers);
router.put('/users/:userId/status', authenticate, authorize('administrator'), sanitize, controller.updateUserStatus);

module.exports = router;
