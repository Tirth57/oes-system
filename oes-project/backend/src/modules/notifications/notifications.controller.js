const notificationsService = require('./notifications.service');
const { success, error, paginated } = require('../../utils/response');

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { error(res, err.message || 'Server error', err.status || 500); }
};

const getNotifications = wrap(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const result = await notificationsService.getNotifications(req.user.id, { page: parseInt(page), limit: parseInt(limit), unreadOnly });
  paginated(res, result.notifications, result.total, result.page, result.limit, 'Notifications retrieved');
});

const markRead = wrap(async (req, res) => {
  await notificationsService.markRead(req.params.id, req.user.id);
  success(res, null, 'Notification marked as read');
});

const markAllRead = wrap(async (req, res) => {
  await notificationsService.markAllRead(req.user.id);
  success(res, null, 'All notifications marked as read');
});

const broadcast = wrap(async (req, res) => {
  const result = await notificationsService.broadcast(req.user.id, req.body);
  success(res, result, `Notification sent to ${result.sent} users`);
});

const getPreferences = wrap(async (req, res) => {
  const data = await notificationsService.getPreferences(req.user.id);
  success(res, data, 'Preferences retrieved');
});

const updatePreferences = wrap(async (req, res) => {
  await notificationsService.updatePreferences(req.user.id, req.body);
  success(res, null, 'Preferences updated');
});

module.exports = { getNotifications, markRead, markAllRead, broadcast, getPreferences, updatePreferences };
