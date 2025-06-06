const asyncHandler = require('express-async-handler');
const Quiz = require('../models/quizModel');
const Course = require('../models/courseModel');
const Joi = require('joi');

/**
 * Get all quizzes with pagination
 * @route   GET /api/quizzes
 * @access  Private
 */
const getQuizzes = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const courseId = req.query.courseId;

  let filter = {};
  
  if (courseId) {
    filter.course = courseId;
  }

  // For students, only show active quizzes
  if (!req.user.isInstructor && !req.user.isAdmin) {
    filter.isActive = true;
    filter.startDate = { $lte: new Date() };
    filter.$or = [
      { endDate: { $gte: new Date() } },
      { endDate: { $exists: false } }
    ];
  }

  // For instructors, show only their quizzes
  if (req.user.isInstructor && !req.user.isAdmin) {
    filter.instructor = req.user._id;
  }

  const quizzes = await Quiz.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('course', 'title')
    .populate('instructor', 'name email')
    .select('-questions.options.isCorrect -attempts');

  const total = await Quiz.countDocuments(filter);

  res.json({
    quizzes,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get quiz by ID
 * @route   GET /api/quizzes/:id
 * @access  Private
 */
const getQuizById = asyncHandler(async (req, res) => {
  let quiz = await Quiz.findById(req.params.id)
    .populate('course', 'title')
    .populate('instructor', 'name email');

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check permissions
  const isInstructor = quiz.instructor._id.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (!isInstructor && !isAdmin) {
    // For students, hide correct answers and show only if quiz is active
    if (!quiz.isActive) {
      res.status(403);
      throw new Error('Quiz is not active');
    }

    // Remove correct answers from questions
    quiz = quiz.toObject();
    quiz.questions = quiz.questions.map(question => ({
      ...question,
      options: question.options.map(option => ({
        text: option.text,
        _id: option._id
      }))
    }));
    
    // Remove attempts data
    delete quiz.attempts;
  }

  res.json(quiz);
});

/**
 * Create a new quiz
 * @route   POST /api/quizzes
 * @access  Private/Instructor
 */
const createQuiz = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    timeLimit: Joi.number().min(1),
    questions: Joi.array().items(
      Joi.object({
        question: Joi.string().required(),
        options: Joi.array().items(
          Joi.object({
            text: Joi.string().required(),
            isCorrect: Joi.boolean().required()
          })
        ).min(2).required(),
        explanation: Joi.string(),
        points: Joi.number().min(1).default(1)
      })
    ).min(1).required(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    settings: Joi.object({
      allowMultipleAttempts: Joi.boolean(),
      maxAttempts: Joi.number().min(1),
      showResults: Joi.boolean(),
      shuffleQuestions: Joi.boolean(),
      shuffleOptions: Joi.boolean()
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, ...quizData } = req.body;

  // Verify course exists and user has permission
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to create quiz for this course');
  }

  const quiz = await Quiz.create({
    ...quizData,
    course: courseId,
    instructor: req.user._id,
  });

  res.status(201).json(quiz);
});

/**
 * Update quiz
 * @route   PUT /api/quizzes/:id
 * @access  Private/Instructor
 */
const updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check ownership
  if (quiz.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this quiz');
  }

  const updatedQuiz = await Quiz.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('course', 'title').populate('instructor', 'name email');

  res.json(updatedQuiz);
});

/**
 * Delete quiz
 * @route   DELETE /api/quizzes/:id
 * @access  Private/Instructor
 */
const deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Check ownership
  if (quiz.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this quiz');
  }

  await quiz.deleteOne();

  res.json({ message: 'Quiz removed' });
});

/**
 * Submit quiz attempt
 * @route   POST /api/quizzes/:id/attempt
 * @access  Private
 */
const submitQuizAttempt = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    answers: Joi.array().items(
      Joi.object({
        questionId: Joi.string().required(),
        selectedOption: Joi.number().required()
      })
    ).required(),
    startTime: Joi.date().required(),
    endTime: Joi.date().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  if (!quiz.isActive) {
    res.status(400);
    throw new Error('Quiz is not active');
  }

  // Check if quiz has ended
  if (quiz.endDate && new Date() > quiz.endDate) {
    res.status(400);
    throw new Error('Quiz has ended');
  }

  // Check previous attempts
  const userAttempts = quiz.attempts.filter(
    attempt => attempt.student.toString() === req.user._id.toString()
  );

  if (!quiz.settings.allowMultipleAttempts && userAttempts.length > 0) {
    res.status(400);
    throw new Error('Multiple attempts not allowed');
  }

  if (userAttempts.length >= quiz.settings.maxAttempts) {
    res.status(400);
    throw new Error('Maximum attempts reached');
  }

  const { answers, startTime, endTime } = req.body;

  // Calculate score
  let score = 0;
  const processedAnswers = answers.map(answer => {
    const question = quiz.questions.id(answer.questionId);
    if (!question) {
      throw new Error('Invalid question ID');
    }

    const selectedOption = question.options[answer.selectedOption];
    const isCorrect = selectedOption && selectedOption.isCorrect;
    const points = isCorrect ? question.points : 0;
    
    score += points;

    return {
      questionId: answer.questionId,
      selectedOption: answer.selectedOption,
      isCorrect,
      points
    };
  });

  const percentage = (score / quiz.totalPoints) * 100;
  const timeSpent = Math.floor((new Date(endTime) - new Date(startTime)) / 1000);

  // Add attempt to quiz
  quiz.attempts.push({
    student: req.user._id,
    answers: processedAnswers,
    score,
    totalPoints: quiz.totalPoints,
    percentage,
    startTime,
    endTime,
    timeSpent
  });

  await quiz.save();

  res.json({
    score,
    totalPoints: quiz.totalPoints,
    percentage,
    timeSpent,
    showResults: quiz.settings.showResults
  });
});

/**
 * Get quiz results
 * @route   GET /api/quizzes/:id/results
 * @access  Private
 */
const getQuizResults = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('attempts.student', 'name email');

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  const isInstructor = quiz.instructor.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (isInstructor || isAdmin) {
    // Return all results for instructor/admin
    res.json(quiz.attempts);
  } else {
    // Return only user's attempts
    const userAttempts = quiz.attempts.filter(
      attempt => attempt.student._id.toString() === req.user._id.toString()
    );
    res.json(userAttempts);
  }
});

module.exports = {
  getQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  submitQuizAttempt,
  getQuizResults,
};