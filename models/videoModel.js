const mongoose = require('mongoose');

const videoSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileKey: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    thumbnailUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create index for faster searching
videoSchema.index({ title: 'text', description: 'text' });

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;