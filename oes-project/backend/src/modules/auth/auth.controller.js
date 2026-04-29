const authService = require('./auth.service');
const { success, error } = require('../../utils/response');
const logger = require('../../utils/logger');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) {
    const status = err.status || 500;
    const msg = err.message || 'Internal server error';
    if (status >= 500) logger.error('Auth controller error:', err);
    error(res, msg, status);
  }
};

const register = wrap(async (req, res) => {
  const user = await authService.register(req.body);
  success(res, user, 'Registration successful. Please check your email to verify your account.', 201);
});

const verifyEmail = wrap(async (req, res) => {
  const result = await authService.verifyEmail(req.query.token || req.body.token);
  success(res, result, 'Email verified successfully');
});

const login = wrap(async (req, res) => {
  const data = await authService.login({
    email: req.body.email,
    password: req.body.password,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  success(res, data, 'Login successful');
});

const logout = wrap(async (req, res) => {
  await authService.logout(req.token, req.user.id);
  success(res, null, 'Logged out successfully');
});

const refreshToken = wrap(async (req, res) => {
  const data = await authService.refreshToken(req.body.refreshToken);
  success(res, data, 'Token refreshed');
});

const forgotPassword = wrap(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  success(res, null, 'If that email exists, a reset link has been sent');
});

const resetPassword = wrap(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  success(res, null, 'Password reset successfully');
});

const getProfile = wrap(async (req, res) => {
  const profile = await authService.getProfile(req.user.id);
  success(res, profile, 'Profile retrieved');
});

const updateProfile = wrap(async (req, res) => {
  const profile = await authService.updateProfile(req.user.id, req.body);
  success(res, profile, 'Profile updated');
});

const changePassword = wrap(async (req, res) => {
  await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  success(res, null, 'Password changed successfully');
});

// Admin endpoints
const listUsers = wrap(async (req, res) => {
  const { role, status, search, page, limit } = req.query;
  const result = await authService.listUsers({ role, status, search, page: parseInt(page) || 1, limit: parseInt(limit) || 20 });
  success(res, result, 'Users retrieved');
});

const updateUserStatus = wrap(async (req, res) => {
  await authService.updateUserStatus(req.user.id, req.params.userId, req.body.status);
  success(res, null, 'User status updated');
});

module.exports = {
  register, verifyEmail, login, logout, refreshToken,
  forgotPassword, resetPassword, getProfile, updateProfile,
  changePassword, listUsers, updateUserStatus,
};
