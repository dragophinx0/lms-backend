const asyncHandler = require('express-async-handler');
const Discussion = require('../models/discussionModel');
const Course = require('../models/courseModel');
const Joi = require('joi');

/**
 * Get all discussions with pagination
 * @route   GET /api/discussions
 * @access  Private
 */
const getDiscussions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const courseId = req.query.courseId;
  const category = req.query.category;
  const search = req.query.search;
  const sortBy = req.query.sortBy || 'lastActivity';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  let filter = {};
  
  if (courseId) {
    filter.course = courseId;
  }

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } }
    ];
  }

  const discussions = await Discussion.find(filter)
    .sort({ isPinned: -1, [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate('author', 'name email')
    .populate('course', 'title')
    .populate('replies.author', 'name email')
    .select('-content');

  const total = await Discussion.countDocuments(filter);

  res.json({
    discussions,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get discussion by ID
 * @route   GET /api/discussions/:id
 * @access  Private
 */
const getDiscussionById = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id)
    .populate('author', 'name email')
    .populate('course', 'title')
    .populate('replies.author', 'name email')
    .populate('likes.user', 'name')
    .populate('replies.likes.user', 'name');

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  // Increment view count
  discussion.views += 1;
  await discussion.save();

  res.json(discussion);
});

/**
 * Create a new discussion
 * @route   POST /api/discussions
 * @access  Private
 */
const createDiscussion = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    content: Joi.string().required(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    category: Joi.string().valid('general', 'question', 'announcement', 'assignment', 'technical'),
    tags: Joi.array().items(Joi.string())
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, ...discussionData } = req.body;

  // Verify course exists if courseId is provided
  if (courseId) {
    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }
  }

  const discussion = await Discussion.create({
    ...discussionData,
    author: req.user._id,
    ...(courseId && { course: courseId }),
  });

  const populatedDiscussion = await Discussion.findById(discussion._id)
    .populate('author', 'name email')
    .populate('course', 'title');

  res.status(201).json(populatedDiscussion);
});

/**
 * Update discussion
 * @route   PUT /api/discussions/:id
 * @access  Private
 */
const updateDiscussion = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string(),
    content: Joi.string(),
    category: Joi.string().valid('general', 'question', 'announcement', 'assignment', 'technical'),
    tags: Joi.array().items(Joi.string()),
    isPinned: Joi.boolean(),
    isLocked: Joi.boolean()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const discussion = await Discussion.findById(req.params.id);

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  // Check ownership or admin privileges
  const isOwner = discussion.author.toString() === req.user._id.toString();
  const canEdit = isOwner || req.user.isAdmin || req.user.isInstructor;

  if (!canEdit) {
    res.status(403);
    throw new Error('Not authorized to update this discussion');
  }

  // Only admins and instructors can pin/lock discussions
  if ((req.body.isPinned !== undefined || req.body.isLocked !== undefined) && 
      !req.user.isAdmin && !req.user.isInstructor) {
    res.status(403);
    throw new Error('Not authorized to pin/lock discussions');
  }

  // Mark as edited if content is changed
  if (req.body.content && req.body.content !== discussion.content) {
    req.body.isEdited = true;
  }

  const updatedDiscussion = await Discussion.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('author', 'name email').populate('course', 'title');

  res.json(updatedDiscussion);
});

/**
 * Delete discussion
 * @route   DELETE /api/discussions/:id
 * @access  Private
 */
const deleteDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  // Check ownership or admin privileges
  const isOwner = discussion.author.toString() === req.user._id.toString();
  const canDelete = isOwner || req.user.isAdmin;

  if (!canDelete) {
    res.status(403);
    throw new Error('Not authorized to delete this discussion');
  }

  await discussion.deleteOne();

  res.json({ message: 'Discussion removed' });
});

/**
 * Add reply to discussion
 * @route   POST /api/discussions/:id/replies
 * @access  Private
 */
const addReply = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const discussion = await Discussion.findById(req.params.id);

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  if (discussion.isLocked) {
    res.status(403);
    throw new Error('Discussion is locked');
  }

  const reply = {
    author: req.user._id,
    content: req.body.content
  };

  discussion.replies.push(reply);
  discussion.lastActivity = new Date();
  await discussion.save();

  const populatedDiscussion = await Discussion.findById(discussion._id)
    .populate('replies.author', 'name email');

  const newReply = populatedDiscussion.replies[populatedDiscussion.replies.length - 1];

  res.status(201).json(newReply);
});

/**
 * Update reply
 * @route   PUT /api/discussions/:id/replies/:replyId
 * @access  Private
 */
const updateReply = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const discussion = await Discussion.findById(req.params.id);

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  const reply = discussion.replies.id(req.params.replyId);

  if (!reply) {
    res.status(404);
    throw new Error('Reply not found');
  }

  // Check ownership
  if (reply.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this reply');
  }

  reply.content = req.body.content;
  reply.isEdited = true;
  reply.updatedAt = new Date();

  await discussion.save();

  res.json(reply);
});

/**
 * Delete reply
 * @route   DELETE /api/discussions/:id/replies/:replyId
 * @access  Private
 */
const deleteReply = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  const reply = discussion.replies.id(req.params.replyId);

  if (!reply) {
    res.status(404);
    throw new Error('Reply not found');
  }

  // Check ownership
  if (reply.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this reply');
  }

  discussion.replies.pull(req.params.replyId);
  await discussion.save();

  res.json({ message: 'Reply removed' });
});

/**
 * Like/Unlike discussion
 * @route   POST /api/discussions/:id/like
 * @access  Private
 */
const toggleLike = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);

  if (!discussion) {
    res.status(404);
    throw new Error('Discussion not found');
  }

  const existingLike = discussion.likes.find(
    like => like.user.toString() === req.user._id.toString()
  );

  if (existingLike) {
    // Unlike
    discussion.likes.pull(existingLike._id);
  } else {
    // Like
    discussion.likes.push({ user: req.user._id });
  }

  await discussion.save();

  res.json({ 
    message: existingLike ? 'Discussion unliked' : 'Discussion liked',
    likesCount: discussion.likes.length
  });
});

module.exports = {
  getDiscussions,
  getDiscussionById,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  addReply,
  updateReply,
  deleteReply,
  toggleLike,
};