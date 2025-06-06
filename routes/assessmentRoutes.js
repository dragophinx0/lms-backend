const express = require('express');
const router = express.Router();
const {
  getAssessments,
  getAssessmentById,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  submitAssessment,
  gradeSubmission,
  getAssessmentSubmissions,
} = require('../controllers/assessmentController');
const { protect, instructor } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Student and instructor routes
router.get('/', getAssessments);
router.get('/:id', getAssessmentById);
router.post('/:id/submit', submitAssessment);

// Instructor only routes
router.post('/', instructor, createAssessment);
router.route('/:id')
  .put(instructor, updateAssessment)
  .delete(instructor, deleteAssessment);

router.get('/:id/submissions', instructor, getAssessmentSubmissions);
router.put('/:id/submissions/:submissionId/grade', instructor, gradeSubmission);

module.exports = router;