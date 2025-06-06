const asyncHandler = require('express-async-handler');
const Assessment = require('../models/assessmentModel');
const Course = require('../models/courseModel');
const Joi = require('joi');

/**
 * Get all assessments with pagination
 * @route   GET /api/assessments
 * @access  Private
 */
const getAssessments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const courseId = req.query.courseId;
  const status = req.query.status;

  let filter = {};
  
  if (courseId) {
    filter.course = courseId;
  }

  // For students, only show published assessments
  if (!req.user.isInstructor && !req.user.isAdmin) {
    filter.isPublished = true;
  }

  // For instructors, show only their assessments
  if (req.user.isInstructor && !req.user.isAdmin) {
    filter.instructor = req.user._id;
  }

  const assessments = await Assessment.find(filter)
    .sort({ dueDate: 1 })
    .skip(skip)
    .limit(limit)
    .populate('course', 'title')
    .populate('instructor', 'name email')
    .select('-submissions');

  const total = await Assessment.countDocuments(filter);

  res.json({
    assessments,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get assessment by ID
 * @route   GET /api/assessments/:id
 * @access  Private
 */
const getAssessmentById = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id)
    .populate('course', 'title')
    .populate('instructor', 'name email')
    .populate('submissions.student', 'name email')
    .populate('submissions.grade.gradedBy', 'name email');

  if (!assessment) {
    res.status(404);
    throw new Error('Assessment not found');
  }

  const isInstructor = assessment.instructor._id.toString() === req.user._id.toString();
  const isAdmin = req.user.isAdmin;

  if (!isInstructor && !isAdmin && !assessment.isPublished) {
    res.status(403);
    throw new Error('Assessment not published');
  }

  // For students, only show their own submissions
  if (!isInstructor && !isAdmin) {
    assessment.submissions = assessment.submissions.filter(
      submission => submission.student._id.toString() === req.user._id.toString()
    );
  }

  res.json(assessment);
});

/**
 * Create a new assessment
 * @route   POST /api/assessments
 * @access  Private/Instructor
 */
const createAssessment = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    type: Joi.string().valid('assignment', 'project', 'essay', 'coding').required(),
    instructions: Joi.string().required(),
    maxPoints: Joi.number().min(1).required(),
    dueDate: Joi.date().required(),
    allowLateSubmission: Joi.boolean(),
    latePenalty: Joi.number().min(0).max(100),
    submissionType: Joi.string().valid('file', 'text', 'url', 'github').required(),
    allowedFileTypes: Joi.array().items(Joi.string()),
    maxFileSize: Joi.number().min(1),
    rubric: Joi.array().items(
      Joi.object({
        criteria: Joi.string().required(),
        maxPoints: Joi.number().min(1).required(),
        description: Joi.string()
      })
    )
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, ...assessmentData } = req.body;

  // Verify course exists and user has permission
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to create assessment for this course');
  }

  const assessment = await Assessment.create({
    ...assessmentData,
    course: courseId,
    instructor: req.user._id,
  });

  res.status(201).json(assessment);
});

/**
 * Update assessment
 * @route   PUT /api/assessments/:id
 * @access  Private/Instructor
 */
const updateAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);

  if (!assessment) {
    res.status(404);
    throw new Error('Assessment not found');
  }

  // Check ownership
  if (assessment.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this assessment');
  }

  const updatedAssessment = await Assessment.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('course', 'title').populate('instructor', 'name email');

  res.json(updatedAssessment);
});

/**
 * Delete assessment
 * @route   DELETE /api/assessments/:id
 * @access  Private/Instructor
 */
const deleteAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);

  if (!assessment) {
    res.status(404);
    throw new Error('Assessment not found');
  }

  // Check ownership
  if (assessment.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this assessment');
  }

  await assessment.deleteOne();

  res.json({ message: 'Assessment removed' });
});

/**
 * Submit assessment
 * @route   POST /api/assessments/:id/submit
 * @access  Private
 */
const submitAssessment = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    content: Joi.object({
      text: Joi.string(),
      fileUrl: Joi.string(),
      fileName: Joi.string(),
      githubUrl: Joi.string().uri(),
      websiteUrl: Joi.string().uri()
    }).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const assessment = await Assessment.findById(req.params.id);

  if (!assessment) {
    res.status(404);
    throw new Error('Assessment not found');
  }

  if (!assessment.isPublished) {
    res.status(400);
    throw new Error('Assessment is not published');
  }

  // Check if already submitted
  const existingSubmission = assessment.submissions.find(
    submission => submission.student.toString() === req.user._id.toString()
  );

  if (existingSubmission) {
    res.status(400);
    throw new Error('Assessment already submitted');
  }

  // Check if past due date
  const now = new Date();
  const isLate = now > assessment.dueDate;

  if (isLate && !assessment.allowLateSubmission) {
    res.status(400);
    throw new Error('Submission deadline has passed');
  }

  const submission = {
    student: req.user._id,
    content: req.body.content,
    isLate,
    submittedAt: now
  };

  assessment.submissions.push(submission);
  await assessment.save();

  res.json({ message: 'Assessment submitted successfully', submission });
});

/**
 * Grade assessment submission
 * @route   PUT /api/assessments/:id/submissions/:submissionId/grade
 * @access  Private/Instructor
 */
const gradeSubmission = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    points: Joi.number().min(0).required(),
    feedback: Joi.string()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const assessment = await Assessment.findById(req.params.id);

  if (!assessment) {
    res.status(404);
    throw new Error('Assessment not found');
  }

  // Check ownership
  if (assessment.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to grade this assessment');
  }

  const submission = assessment.submissions.id(req.params.submissionId);

  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  // Apply late penalty if applicable
  let finalPoints = req.body.points;
  if (submission.isLate && assessment.latePenalty > 0) {
    const daysLate = Math.ceil((submission.submittedAt - assessment.dueDate) / (1000 * 60 * 60 * 24));
    const penalty = (assessment.latePenalty / 100) * daysLate;
    finalPoints = Math.max(0, finalPoints * (1 - penalty));
  }

  submission.grade = {
    points: finalPoints,
    feedback: req.body.feedback,
    gradedAt: new Date(),
    gradedBy: req.user._id
  };
  submission.status = 'graded';

  await assessment.save();

  res.json({ message: 'Submission graded successfully', submission });
});

/**
 * Get assessment submissions
 * @route   GET /api/assessments/:id/submissions
 * @access  Private/Instructor
 */
const getAssessmentSubmissions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const assessment = await Assessment.findById(req.params.id)
    .populate('submissions.student', 'name email')
    .populate('submissions.grade.gradedBy', 'name email');

  if (!assessment) {
    res.status(404);
    throw new Error('Assessment not found');
  }

  // Check ownership
  if (assessment.instructor.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to view submissions');
  }

  const submissions = assessment.submissions
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(skip, skip + limit);

  const total = assessment.submissions.length;

  res.json({
    submissions,
    page,
    pages: Math.ceil(total / limit),
    total,
  });
});

module.exports = {
  getAssessments,
  getAssessmentById,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  submitAssessment,
  gradeSubmission,
  getAssessmentSubmissions,
};