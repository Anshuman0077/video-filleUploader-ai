import Redis from 'ioredis';

// Enhanced Redis configuration with increased timeouts
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  
  // Connection options - FIXED: Increased timeouts
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: true,
  
  // Performance options
  lazyConnect: false, // CHANGED: Set to false for immediate connection
  keepAlive: 30000,
  connectionName: `video-qa-app-${process.env.NODE_ENV || 'development'}`,
  
  // Security options
  password: process.env.REDIS_PASSWORD || undefined,
  
  // Timeout options - INCREASED for BullMQ compatibility
  connectTimeout: 30000, // CHANGED: 10s to 30s
  commandTimeout: 60000, // CHANGED: 5s to 60s for BullMQ operations
  
  // Pooling options
  maxLoadingRetryTime: 30000, // CHANGED: 10s to 30s
  
  // Additional stability options
  family: 4, // Use IPv4
  db: 0, // Explicitly set database
};

// Create Redis client with enhanced error handling
const redisClient = new Redis(redisOptions);

// Connection event handlers with enhanced logging
redisClient.on('connect', () => {
  console.log('🔄 Connecting to Redis...');
});

redisClient.on('ready', () => {
  console.log('✅ Redis connection is ready and operational');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });
});

redisClient.on('close', () => {
  console.log('🔌 Redis connection closed');
});

redisClient.on('reconnecting', (delay) => {
  console.log(`🔄 Redis reconnecting in ${delay}ms`);
});

redisClient.on('end', () => {
  console.log('🔚 Redis connection ended');
});

// Enhanced health check function
redisClient.healthCheck = async () => {
  try {
    const startTime = Date.now();
    await redisClient.ping();
    const responseTime = Date.now() - startTime;
    
    return { 
      status: 'healthy', 
      message: 'Redis is responding normally',
      responseTime: `${responseTime}ms`,
      connected: redisClient.status === 'ready'
    };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      message: error.message,
      connected: false
    };
  }
};

// Statistics tracking
let connectionStats = {
  totalConnections: 0,
  failedConnections: 0,
  lastError: null,
  lastSuccess: null
};

redisClient.on('connect', () => {
  connectionStats.totalConnections++;
  connectionStats.lastSuccess = new Date().toISOString();
});

redisClient.on('error', () => {
  connectionStats.failedConnections++;
  connectionStats.lastError = new Date().toISOString();
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, closing Redis connection gracefully...`);
  
  try {
    await redisClient.quit();
    console.log('✅ Redis connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error);
    redisClient.disconnect();
  }
};

// Process signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default redisClient;