const asyncHandler = require('express-async-handler');
const Course = require('../models/courseModel');
const Video = require('../models/videoModel');
const Joi = require('joi');

/**
 * Get all courses with pagination
 * @route   GET /api/courses
 * @access  Public
 */
const getCourses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  const category = req.query.category || '';
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  // Build filter object
  let filter = {};
  
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  
  if (category) {
    filter.category = category;
  }

  // Only show published courses for non-admin users
  if (!req.user || !req.user.isAdmin) {
    filter.isPublished = true;
  }

  const courses = await Course.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate('instructor', 'name email')
    .populate('videos', 'title duration')
    .select('-students');

  const total = await Course.countDocuments(filter);

  res.json({
    courses,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get course by ID
 * @route   GET /api/courses/:id
 * @access  Public
 */
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .populate('instructor', 'name email')
    .populate('videos', 'title description duration thumbnailUrl')
    .populate('students', 'name email');

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Check if course is published (unless user is admin or instructor)
  if (!course.isPublished && req.user) {
    const isOwner = course.instructor._id.toString() === req.user._id.toString();
    const canAccess = isOwner || req.user.isAdmin;
    
    if (!canAccess) {
      res.status(403);
      throw new Error('Course not published');
    }
  }

  res.json(course);
});

/**
 * Create a new course
 * @route   POST /api/courses
 * @access  Private/Instructor
 */
const createCourse = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    category: Joi.string().required(),
    price: Joi.number().min(0),
    thumbnailUrl: Joi.string().uri(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { title, description, category, price = 0, thumbnailUrl } = req.body;

  const course = await Course.create({
    title,
    description,
    category,
    price,
    thumbnailUrl,
    instructor: req.user._id,
  });

  res.status(201).json(course);
});

/**
 * Update course
 * @route   PUT /api/courses/:id
 * @access  Private/Instructor
 */
const updateCourse = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string(),
    description: Joi.string(),
    category: Joi.string(),
    price: Joi.number().min(0),
    thumbnailUrl: Joi.string().uri(),
    isPublished: Joi.boolean(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Check ownership
  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this course');
  }

  const updatedCourse = await Course.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('instructor', 'name email');

  res.json(updatedCourse);
});

/**
 * Delete course
 * @route   DELETE /api/courses/:id
 * @access  Private/Instructor
 */
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Check ownership
  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this course');
  }

  // Delete associated videos
  await Video.deleteMany({ course: course._id });

  await course.deleteOne();

  res.json({ message: 'Course removed' });
});

/**
 * Enroll in course
 * @route   POST /api/courses/:id/enroll
 * @access  Private
 */
const enrollInCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.isPublished) {
    res.status(400);
    throw new Error('Course is not published');
  }

  // Check if already enrolled
  if (course.students.includes(req.user._id)) {
    res.status(400);
    throw new Error('Already enrolled in this course');
  }

  // Add student to course
  course.students.push(req.user._id);
  await course.save();

  // Add course to user's enrolled courses
  req.user.enrolledCourses.push(course._id);
  await req.user.save();

  res.json({ message: 'Successfully enrolled in course' });
});

/**
 * Get my courses (instructor)
 * @route   GET /api/courses/my-courses
 * @access  Private/Instructor
 */
const getMyCourses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const courses = await Course.find({ instructor: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('videos', 'title duration')
    .select('-students');

  const total = await Course.countDocuments({ instructor: req.user._id });

  res.json({
    courses,
    page,
    pages: Math.ceil(total / limit),
    total,
  });
});

/**
 * Get enrolled courses (student)
 * @route   GET /api/courses/enrolled
 * @access  Private
 */
const getEnrolledCourses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const courses = await Course.find({ students: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('instructor', 'name email')
    .populate('videos', 'title duration');

  const total = await Course.countDocuments({ students: req.user._id });

  res.json({
    courses,
    page,
    pages: Math.ceil(total / limit),
    total,
  });
});

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  getMyCourses,
  getEnrolledCourses,
};