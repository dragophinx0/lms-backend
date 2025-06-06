const express = require('express');
const router = express.Router();
const {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  getMyCourses,
  getEnrolledCourses,
} = require('../controllers/courseController');
const { protect, instructor } = require('../middlewares/authMiddleware');

// Public routes
router.get('/', getCourses);
router.get('/:id', getCourseById);

// Protected routes
router.use(protect);

// Student routes
router.post('/:id/enroll', enrollInCourse);
router.get('/enrolled/my-courses', getEnrolledCourses);

// Instructor routes
router.post('/', instructor, createCourse);
router.get('/my/courses', instructor, getMyCourses);
router.route('/:id')
  .put(instructor, updateCourse)
  .delete(instructor, deleteCourse);

module.exports = router;