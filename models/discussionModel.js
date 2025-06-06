const mongoose = require('mongoose');

const replySchema = mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    likedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  isEdited: {
    type: Boolean,
    default: false,
  },
});

const discussionSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a discussion title'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Please add discussion content'],
      trim: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    category: {
      type: String,
      enum: ['general', 'question', 'announcement', 'assignment', 'technical'],
      default: 'general',
    },
    tags: [{
      type: String,
      trim: true,
    }],
    isPinned: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    replies: [replySchema],
    views: {
      type: Number,
      default: 0,
    },
    likes: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      likedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Update lastActivity when replies are added
discussionSchema.pre('save', function(next) {
  if (this.isModified('replies')) {
    this.lastActivity = new Date();
  }
  next();
});

// Index for better search performance
discussionSchema.index({ title: 'text', content: 'text', tags: 'text' });
discussionSchema.index({ course: 1, lastActivity: -1 });
discussionSchema.index({ author: 1 });

const Discussion = mongoose.model('Discussion', discussionSchema);

module.exports = Discussion;