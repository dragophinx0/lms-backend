const mongoose = require('mongoose');

const codeExecutionSchema = mongoose.Schema({
  code: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    required: true,
    enum: ['javascript', 'python', 'java', 'cpp', 'c', 'html', 'css'],
  },
  input: {
    type: String,
    default: '',
  },
  output: {
    type: String,
  },
  error: {
    type: String,
  },
  executionTime: {
    type: Number, // in milliseconds
  },
  memoryUsed: {
    type: Number, // in bytes
  },
  status: {
    type: String,
    enum: ['success', 'error', 'timeout', 'memory_limit'],
    required: true,
  },
  executedAt: {
    type: Date,
    default: Date.now,
  },
});

const programmingEnvSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    language: {
      type: String,
      required: true,
      enum: ['javascript', 'python', 'java', 'cpp', 'c', 'html', 'css'],
    },
    code: {
      type: String,
      required: true,
      default: '',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    executions: [codeExecutionSchema],
    collaborators: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      permission: {
        type: String,
        enum: ['read', 'write', 'admin'],
        default: 'read',
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    forks: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      forkedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    parentEnv: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProgrammingEnv',
    },
    settings: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'dark',
      },
      fontSize: {
        type: Number,
        default: 14,
      },
      autoSave: {
        type: Boolean,
        default: true,
      },
      showLineNumbers: {
        type: Boolean,
        default: true,
      },
    },
    lastExecuted: {
      type: Date,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
programmingEnvSchema.index({ user: 1, language: 1 });
programmingEnvSchema.index({ course: 1 });
programmingEnvSchema.index({ isPublic: 1, isTemplate: 1 });
programmingEnvSchema.index({ title: 'text', description: 'text', tags: 'text' });

const ProgrammingEnv = mongoose.model('ProgrammingEnv', programmingEnvSchema);

module.exports = ProgrammingEnv;