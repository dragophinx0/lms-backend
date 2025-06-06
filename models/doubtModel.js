const mongoose = require('mongoose');

const doubtSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a doubt title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      trim: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
    },
    category: {
      type: String,
      enum: ['concept', 'technical', 'assignment', 'general'],
      default: 'general',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
    },
    tags: [{
      type: String,
      trim: true,
    }],
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    responses: [{
      responder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      content: {
        type: String,
        required: true,
        trim: true,
      },
      isInstructor: {
        type: Boolean,
        default: false,
      },
      isHelpful: {
        type: Boolean,
        default: false,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      attachments: [{
        fileName: String,
        fileUrl: String,
        fileType: String,
      }],
    }],
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
    upvotes: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      votedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    views: {
      type: Number,
      default: 0,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better search and filtering
doubtSchema.index({ student: 1, status: 1 });
doubtSchema.index({ course: 1, status: 1 });
doubtSchema.index({ title: 'text', description: 'text', tags: 'text' });
doubtSchema.index({ createdAt: -1 });

const Doubt = mongoose.model('Doubt', doubtSchema);

module.exports = Doubt;