const express = require('express');
const router = express.Router();
const {
  uploadMiddleware,
  uploadVideo,
  getVideos,
  getVideoById,
  streamVideo,
  updateVideo,
  deleteVideo,
} = require('../controllers/videoController');
const { protect, instructor, admin } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Get all videos (admin/instructor)
router.get('/', getVideos);

// Upload video (instructor only)
router.post('/', instructor, uploadMiddleware, uploadVideo);

// Video routes by ID
router.route('/:id')
  .get(getVideoById)
  .put(instructor, updateVideo)
  .delete(instructor, deleteVideo);

// Stream video
router.get('/:id/stream', streamVideo);

module.exports = router;