const mongoose = require('mongoose');

const assessmentSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add an assessment title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      trim: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['assignment', 'project', 'essay', 'coding'],
      required: true,
    },
    instructions: {
      type: String,
      required: true,
    },
    maxPoints: {
      type: Number,
      required: true,
      default: 100,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    allowLateSubmission: {
      type: Boolean,
      default: false,
    },
    latePenalty: {
      type: Number, // percentage deduction per day
      default: 10,
    },
    submissionType: {
      type: String,
      enum: ['file', 'text', 'url', 'github'],
      required: true,
    },
    allowedFileTypes: [{
      type: String,
    }],
    maxFileSize: {
      type: Number, // in MB
      default: 10,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    submissions: [{
      student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      submittedAt: {
        type: Date,
        default: Date.now,
      },
      content: {
        text: String,
        fileUrl: String,
        fileName: String,
        githubUrl: String,
        websiteUrl: String,
      },
      isLate: {
        type: Boolean,
        default: false,
      },
      grade: {
        points: Number,
        feedback: String,
        gradedAt: Date,
        gradedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
      status: {
        type: String,
        enum: ['submitted', 'graded', 'returned'],
        default: 'submitted',
      },
    }],
    rubric: [{
      criteria: String,
      maxPoints: Number,
      description: String,
    }],
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
assessmentSchema.index({ course: 1, dueDate: 1 });
assessmentSchema.index({ 'submissions.student': 1 });

const Assessment = mongoose.model('Assessment', assessmentSchema);

module.exports = Assessment;