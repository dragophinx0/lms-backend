const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: [
        'course_enrollment',
        'assignment_due',
        'quiz_available',
        'grade_posted',
        'discussion_reply',
        'doubt_response',
        'announcement',
        'system',
        'reminder'
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      courseId: mongoose.Schema.Types.ObjectId,
      assessmentId: mongoose.Schema.Types.ObjectId,
      quizId: mongoose.Schema.Types.ObjectId,
      discussionId: mongoose.Schema.Types.ObjectId,
      doubtId: mongoose.Schema.Types.ObjectId,
      videoId: mongoose.Schema.Types.ObjectId,
      url: String,
      actionText: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    expiresAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Mark as read method
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;