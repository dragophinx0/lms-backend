const mongoose = require('mongoose');
const dotenv = require('dotenv');
const colors = require('colors');

// Load environment variables 
dotenv.config();

const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB...'.yellow);
    
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    
    console.log(`✅ MongoDB Connected Successfully!`.green.bold);
    console.log(`📍 Host: ${conn.connection.host}`.cyan.underline);
    console.log(`🗄️  Database Name: ${conn.connection.name}`.cyan);
    console.log(`🔗 Connection State: ${conn.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`.cyan);
    console.log(`⚡ MongoDB Version: ${conn.connection.db.serverConfig?.s?.serverDescription?.version || 'Unknown'}`.cyan);
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`.red.bold);
    console.error(`🔍 Connection String: ${process.env.MONGODB_URI ? 'Provided' : 'Missing'}`.red);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('🟢 Mongoose connected to MongoDB'.green);
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:'.red, err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 Mongoose disconnected from MongoDB'.yellow);
});

// Handle process termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔴 MongoDB connection closed due to app termination'.red);
  process.exit(0);
});

module.exports = connectDB;