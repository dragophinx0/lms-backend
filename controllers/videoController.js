const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Video = require('../models/videoModel');
const Course = require('../models/courseModel');
const r2Service = require('../services/r2Service');
const Joi = require('joi');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only video files
    const filetypes = /mp4|webm|mov|avi|mkv/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only video files are allowed!'));
  },
}).single('video');

/**
 * Upload middleware wrapper
 */
const uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      res.status(400);
      throw new Error(`Upload error: ${err.message}`);
    } else if (err) {
      res.status(400);
      throw new Error(err.message);
    }
    next();
  });
};

/**
 * Upload a video
 * @route   POST /api/videos
 * @access  Private/Instructor
 */
const uploadVideo = asyncHandler(async (req, res) => {
  // Validate request
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    isPublic: Joi.boolean(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a video file');
  }

  const { title, description, courseId, isPublic = false } = req.body;
  
  // Generate a unique file key
  const fileExtension = path.extname(req.file.originalname);
  const fileKey = `videos/${req.user._id}/${Date.now()}${fileExtension}`;

  try {
    // Upload to R2
    await r2Service.uploadFile(
      req.file.buffer,
      fileKey,
      req.file.mimetype
    );

    // Create video document
    const video = await Video.create({
      title,
      description,
      fileName: req.file.originalname,
      fileKey,
      fileSize: req.file.size,
      contentType: req.file.mimetype,
      owner: req.user._id,
      isPublic,
      ...(courseId && { course: courseId }),
    });

    // If courseId is provided, add video to course
    if (courseId) {
      await Course.findByIdAndUpdate(
        courseId,
        { $push: { videos: video._id } }
      );
    }

    res.status(201).json(video);
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to upload video: ${error.message}`);
  }
});

/**
 * Get all videos (for admin)
 * @route   GET /api/videos
 * @access  Private/Admin
 */
const getVideos = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // For admins: get all videos
  // For instructors: get only their videos
  const filter = req.user.isAdmin ? {} : { owner: req.user._id };

  const videos = await Video.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('owner', 'name email')
    .populate('course', 'title');

  const total = await Video.countDocuments(filter);

  res.json({
    videos,
    page,
    pages: Math.ceil(total / limit),
    total,
  });
});

/**
 * Get video by ID
 * @route   GET /api/videos/:id
 * @access  Private
 */
const getVideoById = asyncHandler(async (req, res) => {
  const video = await Video.findById(req.params.id)
    .populate('owner', 'name email')
    .populate('course', 'title');

  if (!video) {
    res.status(404);
    throw new Error('Video not found');
  }

  // Check permissions
  const isOwner = video.owner._id.toString() === req.user._id.toString();
  const canAccess = isOwner || req.user.isAdmin || video.isPublic;

  if (!canAccess) {
    res.status(403);
    throw new Error('Not authorized to access this video');
  }

  // Increment view count
  if (!isOwner && !req.user.isAdmin) {
    video.viewCount += 1;
    await video.save();
  }

  res.json(video);
});

/**
 * Stream video
 * @route   GET /api/videos/:id/stream
 * @access  Private
 */
const streamVideo = asyncHandler(async (req, res) => {
  const video = await Video.findById(req.params.id);

  if (!video) {
    res.status(404);
    throw new Error('Video not found');
  }

  // Check permissions
  const isOwner = video.owner.toString() === req.user._id.toString();
  const canAccess = isOwner || req.user.isAdmin || video.isPublic;

  if (!canAccess) {
    res.status(403);
    throw new Error('Not authorized to access this video');
  }

  try {
    // Generate a signed URL
    const url = await r2Service.getSignedVideoUrl(video.fileKey);
    
    // Return the URL rather than streaming through the server
    res.json({ streamUrl: url });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to stream video: ${error.message}`);
  }
});

/**
 * Update video
 * @route   PUT /api/videos/:id
 * @access  Private/Instructor
 */
const updateVideo = asyncHandler(async (req, res) => {
  // Validate request
  const schema = Joi.object({
    title: Joi.string(),
    description: Joi.string(),
    isPublic: Joi.boolean(),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const video = await Video.findById(req.params.id);

  if (!video) {
    res.status(404);
    throw new Error('Video not found');
  }

  // Check ownership
  if (video.owner.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to update this video');
  }

  // Update course reference if courseId changed
  if (req.body.courseId && (!video.course || video.course.toString() !== req.body.courseId)) {
    // Remove from old course if exists
    if (video.course) {
      await Course.findByIdAndUpdate(
        video.course,
        { $pull: { videos: video._id } }
      );
    }
    
    // Add to new course
    await Course.findByIdAndUpdate(
      req.body.courseId,
      { $push: { videos: video._id } }
    );
  }

  // Update video
  const updatedVideo = await Video.findByIdAndUpdate(
    req.params.id,
    {
      title: req.body.title || video.title,
      description: req.body.description || video.description,
      isPublic: req.body.isPublic !== undefined ? req.body.isPublic : video.isPublic,
      ...(req.body.courseId && { course: req.body.courseId }),
    },
    { new: true }
  );

  res.json(updatedVideo);
});

/**
 * Delete video
 * @route   DELETE /api/videos/:id
 * @access  Private/Instructor
 */
const deleteVideo = asyncHandler(async (req, res) => {
  const video = await Video.findById(req.params.id);

  if (!video) {
    res.status(404);
    throw new Error('Video not found');
  }

  // Check ownership
  if (video.owner.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this video');
  }

  try {
    // Delete from R2
    await r2Service.deleteFile(video.fileKey);
    
    // Remove from course if assigned
    if (video.course) {
      await Course.findByIdAndUpdate(
        video.course,
        { $pull: { videos: video._id } }
      );
    }
    
    // Delete video document
    await video.deleteOne();
    
    res.json({ message: 'Video removed' });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to delete video: ${error.message}`);
  }
});

module.exports = {
  uploadMiddleware,
  uploadVideo,
  getVideos,
  getVideoById,
  streamVideo,
  updateVideo,
  deleteVideo,
};