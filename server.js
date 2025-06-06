const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const colors = require('colors');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middlewares/errorMiddleware');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/assessments', require('./routes/assessmentRoutes'));
app.use('/api/discussions', require('./routes/discussionRoutes'));
app.use('/api/doubts', require('./routes/doubtRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/programming', require('./routes/programmingRoutes'));

// Base route
app.get('/', (req, res) => {
  console.log('🌐 Root endpoint accessed'.green);
  res.json({ 
    message: '🚀 LMS Video Streaming API Server is running successfully!',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      videos: '/api/videos',
      courses: '/api/courses',
      quizzes: '/api/quizzes',
      assessments: '/api/assessments',
      discussions: '/api/discussions',
      doubts: '/api/doubts',
      notifications: '/api/notifications',
      programming: '/api/programming'
    }
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`.yellow.bold);
  console.log(`📡 API Base URL: http://localhost:${PORT}`.cyan);
  console.log(`🔗 Health Check: http://localhost:${PORT}/`.cyan);
});