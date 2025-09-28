import { Worker } from 'bullmq';
import redisClient from '../config/redis.js';
import { processVideo, workerOptions } from "./video.processor.js";
import connectDB from '../config/database.js';

class WorkerManager {
  constructor() {
    this.worker = null;
    this.isRunning = false;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing video processing worker...');
      
      // Connect to database first
      await this.connectDatabaseWithRetry();
      
      // Validate Redis connection
      await this.validateRedisConnection();
      
      // Initialize worker with enhanced configuration
      this.worker = new Worker('video-processing', processVideo, {
        connection: redisClient,
        concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 1,
        limiter: {
          max: 1,
          duration: 1000,
        },
        settings: {
          stalledInterval: parseInt(process.env.WORKER_STALLED_INTERVAL) || 30000,
          maxStalledCount: 2,
          lockDuration: parseInt(process.env.WORKER_LOCK_DURATION) || 1800000,
          retryProcessDelay: 5000,
        },
        // Increased timeouts for BullMQ operations
        runRetryDelay: 10000,
        drainDelay: 5,
      });

      this.setupEventHandlers();
      this.isRunning = true;
      
      console.log('✅ Worker configuration:');
      console.log(`   - Concurrency: ${parseInt(process.env.WORKER_CONCURRENCY) || 1}`);
      console.log(`   - Max attempts: ${parseInt(process.env.JOB_MAX_ATTEMPTS) || 3}`);
      console.log(`   - Lock duration: ${parseInt(process.env.WORKER_LOCK_DURATION) || 1800000}ms`);
      console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize worker:', error);
      throw error;
    }
  }

  async connectDatabaseWithRetry(maxRetries = 5, retryDelay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await connectDB();
        console.log('✅ Database connection established');
        return;
      } catch (error) {
        console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
        }
        console.log(`⏳ Retrying database connection in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async validateRedisConnection() {
    try {
      console.log('🔄 Validating Redis connection...');
      await redisClient.ping();
      console.log('✅ Redis connection validated');
    } catch (error) {
      console.error('❌ Redis connection validation failed:', error);
      throw new Error('Redis connection failed');
    }
  }

  setupEventHandlers() {
    if (!this.worker) return;

    this.worker.on('completed', (job, returnvalue) => {
      console.log(`✅ Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('❌ Worker error:', {
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`⚠️ Job ${jobId} stalled`);
    });

    this.worker.on('active', (job) => {
      console.log(`🔧 Job ${job.id} is now active`);
    });

    this.worker.on('closing', () => {
      console.log('🔚 Worker is closing...');
    });

    this.worker.on('closed', () => {
      console.log('🔚 Worker closed');
      this.isRunning = false;
    });
  }

  async close() {
    if (this.worker) {
      console.log('🔄 Closing worker...');
      await this.worker.close();
      this.isRunning = false;
      console.log('✅ Worker closed successfully');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      workerId: this.worker?.id,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 1
    };
  }
}

// Create and export worker manager instance
const workerManager = new WorkerManager();

// Enhanced graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down worker gracefully...`);
  
  try {
    await workerManager.close();
    
    // Close Redis connection properly
    await redisClient.quit();
    console.log('✅ Redis connection closed');
    
    console.log('✅ Worker shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during worker shutdown:', error);
    process.exit(1);
  }
};

// Process signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Initialize worker
workerManager.initialize().then(() => {
  console.log('🎯 Video processing worker ready and waiting for jobs...');
}).catch((error) => {
  console.error('💥 Failed to start worker:', error);
  process.exit(1);
});

export default workerManager;