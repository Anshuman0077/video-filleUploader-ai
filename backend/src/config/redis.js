import Redis from 'ioredis';

const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryDelayOnFailover: 100,
  maxLoadingRetryTime: 10000
};

const redisClient = new Redis(redisOptions);

// Handle connection events
redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

redisClient.on('close', () => {
  console.log('🔌 Redis connection closed');
});

export default redisClient;