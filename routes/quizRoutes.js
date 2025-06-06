const express = require('express');
const router = express.Router();
const {
  getQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  submitQuizAttempt,
  getQuizResults,
} = require('../controllers/quizController');
const { protect, instructor } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Student and instructor routes
router.get('/', getQuizzes);
router.get('/:id', getQuizById);
router.post('/:id/attempt', submitQuizAttempt);
router.get('/:id/results', getQuizResults);

// Instructor only routes
router.post('/', instructor, createQuiz);
router.route('/:id')
  .put(instructor, updateQuiz)
  .delete(instructor, deleteQuiz);

module.exports = router;