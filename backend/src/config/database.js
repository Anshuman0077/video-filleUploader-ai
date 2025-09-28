import mongoose from 'mongoose';

// Enhanced MongoDB connection options - REMOVED unsupported options
const connectionOptions = {
  // Connection pool options
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  
  // Server selection and timeout options
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  heartbeatFrequencyMS: 10000,
  
  // Write concern and retry options
  w: 'majority',
  journal: true,
  retryWrites: true,
  
  // Authentication and SSL options
  authSource: 'admin',
  
  // Performance options - REMOVED bufferMaxEntries as it's deprecated
  bufferCommands: true,
};

const connectDB = async () => {
  try {
    // Validate MongoDB URI
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    if (!process.env.MONGODB_URI.startsWith('mongodb://') && 
        !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB URI format');
    }

    // Use DB_NAME from environment or default
    const DB_NAME = process.env.DB_NAME || 'video-qa-app';

    console.log('🔄 Connecting to MongoDB...');
    
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,
      connectionOptions
    );
    
    console.log(`✅ MongoDB Connected! DB HOST: ${connectionInstance.connection.host}`);
    console.log(`📊 Database Name: ${DB_NAME}`);
    
    return connectionInstance;
  } catch (error) {
    console.error("❌ MongoDB connection error:", {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    // Don't exit immediately in production - allow for retry
    if (process.env.NODE_ENV === 'production') {
      console.log('⏳ Will retry connection in background...');
      // Implement retry logic
      setTimeout(connectDB, 5000);
    } else {
      process.exit(1);
    }
  }
};

// Enhanced connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected from MongoDB');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 Mongoose reconnected to MongoDB');
});

mongoose.connection.on('close', () => {
  console.log('🔚 Mongoose connection closed');
});

// Enhanced health check function
mongoose.healthCheck = async () => {
  try {
    const startTime = Date.now();
    
    // Simple query to check database responsiveness
    await mongoose.connection.db.admin().ping();
    const responseTime = Date.now() - startTime;
    
    const dbStats = await mongoose.connection.db.stats().catch(() => ({}));
    
    return {
      status: 'healthy',
      message: 'MongoDB is responding normally',
      responseTime: `${responseTime}ms`,
      dbStats: {
        collections: dbStats.collections,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes
      },
      readyState: mongoose.connection.readyState
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      readyState: mongoose.connection.readyState
    };
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, closing MongoDB connection gracefully...`);
  
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
};

// Process signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Connection monitoring
setInterval(() => {
  const state = mongoose.connection.readyState;
  if (state !== 1) { // 1 = connected
    console.warn('⚠️ MongoDB connection state:', {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }[state]);
  }
}, 30000); // Check every 30 seconds

export default connectDB;