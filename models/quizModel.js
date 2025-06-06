const mongoose = require('mongoose');

const questionSchema = mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Please add a question'],
    trim: true,
  },
  options: [{
    text: {
      type: String,
      required: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
  }],
  explanation: {
    type: String,
    trim: true,
  },
  points: {
    type: Number,
    default: 1,
  },
});

const quizSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a quiz title'],
      trim: true,
    },
    description: {
      type: String,
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
    questions: [questionSchema],
    timeLimit: {
      type: Number, // in minutes
      default: 30,
    },
    totalPoints: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    attempts: [{
      student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        selectedOption: Number,
        isCorrect: Boolean,
        points: Number,
      }],
      score: Number,
      totalPoints: Number,
      percentage: Number,
      startTime: Date,
      endTime: Date,
      timeSpent: Number, // in seconds
    }],
    settings: {
      allowMultipleAttempts: {
        type: Boolean,
        default: false,
      },
      maxAttempts: {
        type: Number,
        default: 1,
      },
      showResults: {
        type: Boolean,
        default: true,
      },
      shuffleQuestions: {
        type: Boolean,
        default: false,
      },
      shuffleOptions: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Calculate total points when questions are modified
quizSchema.pre('save', function(next) {
  if (this.isModified('questions')) {
    this.totalPoints = this.questions.reduce((total, question) => total + question.points, 0);
  }
  next();
});

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = Quiz;