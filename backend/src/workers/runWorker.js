import './../config/env.js';
import { videoProcessorWorker } from './video.processor.js';
import connectDB from '../config/database.js';

// Connect to database
connectDB();

console.log('🚀 Video processing worker started...');
console.log('✅ Worker configuration:');
console.log(`   - Concurrency: ${process.env.WORKER_CONCURRENCY || 1}`);
console.log(`   - Max attempts: ${process.env.JOB_MAX_ATTEMPTS || 3}`);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await videoProcessorWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await videoProcessorWorker.close();
  process.exit(0);
});