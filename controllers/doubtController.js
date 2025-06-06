const asyncHandler = require('express-async-handler');
const Doubt = require('../models/doubtModel');
const Course = require('../models/courseModel');
const Video = require('../models/videoModel');
const Joi = require('joi');

/**
 * Get all doubts with pagination
 * @route   GET /api/doubts
 * @access  Private
 */
const getDoubts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const courseId = req.query.courseId;
  const status = req.query.status;
  const category = req.query.category;
  const priority = req.query.priority;
  const search = req.query.search;

  let filter = {};
  
  if (courseId) {
    filter.course = courseId;
  }

  if (status) {
    filter.status = status;
  }

  if (category) {
    filter.category = category;
  }

  if (priority) {
    filter.priority = priority;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } }
    ];
  }

  // For students, show only their doubts
  if (!req.user.isInstructor && !req.user.isAdmin) {
    filter.student = req.user._id;
  }

  const doubts = await Doubt.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('student', 'name email')
    .populate('course', 'title')
    .populate('video', 'title')
    .populate('responses.responder', 'name email')
    .populate('resolvedBy', 'name email');

  const total = await Doubt.countDocuments(filter);

  res.json({
    doubts,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get doubt by ID
 * @route   GET /api/doubts/:id
 * @access  Private
 */
const getDoubtById = asyncHandler(async (req, res) => {
  const doubt = await Doubt.findById(req.params.id)
    .populate('student', 'name email')
    .populate('course', 'title')
    .populate('video', 'title')
    .populate('responses.responder', 'name email')
    .populate('resolvedBy', 'name email')
    .populate('upvotes.user', 'name');

  if (!doubt) {
    res.status(404);
    throw new Error('Doubt not found');
  }

  // Check permissions
  const isOwner = doubt.student._id.toString() === req.user._id.toString();
  const canView = isOwner || req.user.isInstructor || req.user.isAdmin;

  if (!canView) {
    res.status(403);
    throw new Error('Not authorized to view this doubt');
  }

  // Increment view count
  if (!isOwner) {
    doubt.views += 1;
    await doubt.save();
  }

  res.json(doubt);
});

/**
 * Create a new doubt
 * @route   POST /api/doubts
 * @access  Private
 */
const createDoubt = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    videoId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    category: Joi.string().valid('concept', 'technical', 'assignment', 'general'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    tags: Joi.array().items(Joi.string()),
    isAnonymous: Joi.boolean()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, videoId, ...doubtData } = req.body;

  // Verify course exists if courseId is provided
  if (courseId) {
    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }
  }

  // Verify video exists if videoId is provided
  if (videoId) {
    const video = await Video.findById(videoId);
    if (!video) {
      res.status(404);
      throw new Error('Video not found');
    }
  }

  const doubt = await Doubt.create({
    ...doubtData,
    student: req.user._id,
    ...(courseId && { course: courseId }),
    ...(videoId && { video: videoId }),
  });

  const populatedDoubt = await Doubt.findById(doubt._id)
    .populate('student', 'name email')
    .populate('course', 'title')
    .populate('video', 'title');

  res.status(201).json(populatedDoubt);
});

/**
 * Update doubt
 * @route   PUT /api/doubts/:id
 * @access  Private
 */
const updateDoubt = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string(),
    description: Joi.string(),
    category: Joi.string().valid('concept', 'technical', 'assignment', 'general'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    status: Joi.string().valid('open', 'in-progress', 'resolved', 'closed'),
    tags: Joi.array().items(Joi.string())
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const doubt = await Doubt.findById(req.params.id);

  if (!doubt) {
    res.status(404);
    throw new Error('Doubt not found');
  }

  // Check ownership or instructor/admin privileges
  const isOwner = doubt.student.toString() === req.user._id.toString();
  const canEdit = isOwner || req.user.isInstructor || req.user.isAdmin;

  if (!canEdit) {
    res.status(403);
    throw new Error('Not authorized to update this doubt');
  }

  // Only instructors/admins can change status
  if (req.body.status && !req.user.isInstructor && !req.user.isAdmin) {
    delete req.body.status;
  }

  const updatedDoubt = await Doubt.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('student', 'name email')
   .populate('course', 'title')
   .populate('video', 'title');

  res.json(updatedDoubt);
});

/**
 * Delete doubt
 * @route   DELETE /api/doubts/:id
 * @access  Private
 */
const deleteDoubt = asyncHandler(async (req, res) => {
  const doubt = await Doubt.findById(req.params.id);

  if (!doubt) {
    res.status(404);
    throw new Error('Doubt not found');
  }

  // Check ownership or admin privileges
  const isOwner = doubt.student.toString() === req.user._id.toString();
  const canDelete = isOwner || req.user.isAdmin;

  if (!canDelete) {
    res.status(403);
    throw new Error('Not authorized to delete this doubt');
  }

  await doubt.deleteOne();

  res.json({ message: 'Doubt removed' });
});

/**
 * Add response to doubt
 * @route   POST /api/doubts/:id/responses
 * @access  Private
 */
const addResponse = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().required(),
    isHelpful: Joi.boolean()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const doubt = await Doubt.findById(req.params.id);

  if (!doubt) {
    res.status(404);
    throw new Error('Doubt not found');
  }

  if (doubt.status === 'closed') {
    res.status(403);
    throw new Error('Cannot respond to closed doubt');
  }

  const response = {
    responder: req.user._id,
    content: req.body.content,
    isInstructor: req.user.isInstructor || req.user.isAdmin,
    isHelpful: req.body.isHelpful || false
  };

  doubt.responses.push(response);
  
  // Update status to in-progress if it was open
  if (doubt.status === 'open') {
    doubt.status = 'in-progress';
  }

  await doubt.save();

  const populatedDoubt = await Doubt.findById(doubt._id)
    .populate('responses.responder', 'name email');

  const newResponse = populatedDoubt.responses[populatedDoubt.responses.length - 1];

  res.status(201).json(newResponse);
});

/**
 * Mark doubt as resolved
 * @route   PUT /api/doubts/:id/resolve
 * @access  Private
 */
const resolveDoubt = asyncHandler(async (req, res) => {
  const doubt = await Doubt.findById(req.params.id);

  if (!doubt) {
    res.status(404);
    throw new Error('Doubt not found');
  }

  // Check if user can resolve (owner, instructor, or admin)
  const isOwner = doubt.student.toString() === req.user._id.toString();
  const canResolve = isOwner || req.user.isInstructor || req.user.isAdmin;

  if (!canResolve) {
    res.status(403);
    throw new Error('Not authorized to resolve this doubt');
  }

  doubt.status = 'resolved';
  doubt.resolvedBy = req.user._id;
  doubt.resolvedAt = new Date();

  await doubt.save();

  res.json({ message: 'Doubt marked as resolved' });
});

/**
 * Toggle upvote on doubt
 * @route   POST /api/doubts/:id/upvote
 * @access  Private
 */
const toggleUpvote = asyncHandler(async (req, res) => {
  const doubt = await Doubt.findById(req.params.id);

  if (!doubt) {
    res.status(404);
    throw new Error('Doubt not found');
  }

  const existingUpvote = doubt.upvotes.find(
    upvote => upvote.user.toString() === req.user._id.toString()
  );

  if (existingUpvote) {
    // Remove upvote
    doubt.upvotes.pull(existingUpvote._id);
  } else {
    // Add upvote
    doubt.upvotes.push({ user: req.user._id });
  }

  await doubt.save();

  res.json({ 
    message: existingUpvote ? 'Upvote removed' : 'Doubt upvoted',
    upvotesCount: doubt.upvotes.length
  });
});

module.exports = {
  getDoubts,
  getDoubtById,
  createDoubt,
  updateDoubt,
  deleteDoubt,
  addResponse,
  resolveDoubt,
  toggleUpvote,
};