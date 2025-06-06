const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getNotificationStats,
} = require('../controllers/notificationController');
const { protect, admin } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// User notification routes
router.get('/', getNotifications);
router.get('/stats', getNotificationStats);
router.put('/mark-all-read', markAllAsRead);
router.delete('/delete-all', deleteAllNotifications);

router.route('/:id')
  .get(getNotificationById)
  .delete(deleteNotification);

router.put('/:id/read', markAsRead);

// Admin only routes
router.post('/', admin, createNotification);

module.exports = router;