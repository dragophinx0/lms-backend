const asyncHandler = require('express-async-handler');
const Notification = require('../models/notificationModel');
const Joi = require('joi');

/**
 * Get user notifications with pagination
 * @route   GET /api/notifications
 * @access  Private
 */
const getNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const isRead = req.query.isRead;
  const type = req.query.type;

  let filter = { 
    recipient: req.user._id,
    isDeleted: false
  };

  if (isRead !== undefined) {
    filter.isRead = isRead === 'true';
  }

  if (type) {
    filter.type = type;
  }

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'name email');

  const total = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
    isDeleted: false
  });

  res.json({
    notifications,
    page,
    pages: Math.ceil(total / limit),
    total,
    unreadCount,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get notification by ID
 * @route   GET /api/notifications/:id
 * @access  Private
 */
const getNotificationById = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id)
    .populate('sender', 'name email');

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check ownership
  if (notification.recipient.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this notification');
  }

  res.json(notification);
});

/**
 * Create a new notification
 * @route   POST /api/notifications
 * @access  Private/Admin
 */
const createNotification = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    recipientId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    type: Joi.string().valid(
      'course_enrollment',
      'assignment_due',
      'quiz_available',
      'grade_posted',
      'discussion_reply',
      'doubt_response',
      'announcement',
      'system',
      'reminder'
    ).required(),
    title: Joi.string().required(),
    message: Joi.string().required(),
    data: Joi.object({
      courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
      assessmentId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
      quizId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
      discussionId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
      doubtId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
      videoId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
      url: Joi.string(),
      actionText: Joi.string()
    }),
    priority: Joi.string().valid('low', 'medium', 'high'),
    expiresAt: Joi.date()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { recipientId, ...notificationData } = req.body;

  const notification = await Notification.create({
    ...notificationData,
    recipient: recipientId,
    sender: req.user._id,
  });

  res.status(201).json(notification);
});

/**
 * Mark notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check ownership
  if (notification.recipient.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this notification');
  }

  await notification.markAsRead();

  res.json({ message: 'Notification marked as read' });
});

/**
 * Mark all notifications as read
 * @route   PUT /api/notifications/mark-all-read
 * @access  Private
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { 
      recipient: req.user._id, 
      isRead: false,
      isDeleted: false 
    },
    { 
      isRead: true, 
      readAt: new Date() 
    }
  );

  res.json({ message: 'All notifications marked as read' });
});

/**
 * Delete notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check ownership
  if (notification.recipient.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to delete this notification');
  }

  notification.isDeleted = true;
  await notification.save();

  res.json({ message: 'Notification deleted' });
});

/**
 * Delete all notifications
 * @route   DELETE /api/notifications/delete-all
 * @access  Private
 */
const deleteAllNotifications = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { 
      recipient: req.user._id,
      isDeleted: false 
    },
    { 
      isDeleted: true 
    }
  );

  res.json({ message: 'All notifications deleted' });
});

/**
 * Get notification statistics
 * @route   GET /api/notifications/stats
 * @access  Private
 */
const getNotificationStats = asyncHandler(async (req, res) => {
  const stats = await Notification.aggregate([
    {
      $match: {
        recipient: req.user._id,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        unreadCount: {
          $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
        }
      }
    }
  ]);

  const totalCount = await Notification.countDocuments({
    recipient: req.user._id,
    isDeleted: false
  });

  const totalUnreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
    isDeleted: false
  });

  res.json({
    totalCount,
    totalUnreadCount,
    byType: stats
  });
});

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getNotificationStats,
};