import { Queue } from 'bullmq';
import redisClient from '../config/redis.js';

export const processVideoQueue = new Queue('video-processing', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: Number(process.env.JOB_MAX_ATTEMPTS || 5),
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 10,
    removeOnFail: 20,
    delay: 1000, // Small delay to ensure database operations complete
  },
});

// Queue event handlers
processVideoQueue.on('error', (err) => {
  console.error('[VideoQueue] Queue error:', err);
});
  
processVideoQueue.on('waiting', (job) => {
  console.log(`[VideoQueue] Job ${job.id} is waiting`);
});

processVideoQueue.on('active', (job) => {
  console.log(`[VideoQueue] Job ${job.id} is active`);
});

processVideoQueue.on('stalled', (job) => {
  console.warn(`[VideoQueue] Job ${job.id} stalled`);
});

console.log('[VideoQueue] Video processing queue initialized');

export default processVideoQueue;