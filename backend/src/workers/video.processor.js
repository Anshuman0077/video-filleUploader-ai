import { Worker } from 'bullmq';
import Video from '../models/videos.model.js';
import { generateSummary, generateEmbeddings } from '../services/gemini.service.js';
import RAGTranscriptionService from '../services/transcription.service.js';
import redisClient from '../config/redis.js';
import mongoose from 'mongoose';

// Enhanced job validation
const validateJobData = (jobData) => {
  const errors = [];

  if (!jobData.videoId || typeof jobData.videoId !== 'string') {
    errors.push('Invalid or missing videoId');
  }

  if (!jobData.cloudinaryUrl || typeof jobData.cloudinaryUrl !== 'string') {
    errors.push('Invalid or missing cloudinaryUrl');
  }

  if (!jobData.cloudinaryUrl.startsWith('https://')) {
    errors.push('Invalid cloudinaryUrl format');
  }

  if (jobData.language && typeof jobData.language !== 'string') {
    errors.push('Invalid language format');
  }

  // Validate videoId format if it's supposed to be an ObjectId
  if (jobData.videoId && !mongoose.Types.ObjectId.isValid(jobData.videoId)) {
    errors.push('Invalid videoId format');
  }

  if (errors.length > 0) {
    throw new Error(`Job validation failed: ${errors.join(', ')}`);
  }

  return {
    videoId: jobData.videoId.trim(),
    cloudinaryUrl: jobData.cloudinaryUrl.trim(),
    language: jobData.language?.trim() || 'english'
  };
};

// Atomic update helper with retry logic
const atomicVideoUpdate = async (videoId, update, maxRetries = 3) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      const result = await Video.findByIdAndUpdate(
        videoId,
        update,
        { 
          new: true,
          runValidators: true,
          session: session
        }
      );

      await session.commitTransaction();
      await session.endSession();
      return result;
    } catch (error) {
      attempts++;
      
      if (attempts === maxRetries) {
        throw new Error(`Failed to update video after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
    }
  }
};

// Process video job with enhanced error handling and resource management
export const processVideo = async (job) => {
  let video = null;
  let transactionSession = null;

  try {
    console.log(`[EnhancedVideoProcessor] Starting processing for job: ${job.id}`);
    
    // Validate job data
    const { videoId, cloudinaryUrl, language } = validateJobData(job.data);

    // Start MongoDB session for transaction
    transactionSession = await mongoose.startSession();
    transactionSession.startTransaction();

    // Fetch video with session for atomic operations
    video = await Video.findById(videoId).session(transactionSession);
    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    // Check for race conditions: ensure video is in queued state
    if (video.status !== 'queued') {
      console.warn(`Video ${videoId} is already being processed or completed. Current status: ${video.status}`);
      
      // If already completed, return existing results
      if (video.status === 'completed') {
        await transactionSession.commitTransaction();
        await transactionSession.endSession();
        return { 
          videoId, 
          status: 'already_completed',
          existingData: {
            transcriptLength: video.transcript?.length || 0,
            summaryLength: video.summary?.length || 0
          }
        };
      }
      
      // If processing, we might want to continue or abort based on business logic
      if (video.status === 'processing') {
        // Check if processing started recently (within 30 minutes)
        const processingTime = new Date() - video.updatedAt;
        if (processingTime < 30 * 60 * 1000) {
          throw new Error(`Video ${videoId} is already being processed`);
        }
        // If stuck in processing for too long, we can retry
      }
    }

    // Atomic status update to processing
    video.status = 'processing';
    video.processedAt = new Date();
    await video.save({ session: transactionSession });

    await job.updateProgress({ phase: 'started', progress: 5 });
    await transactionSession.commitTransaction();
    await transactionSession.endSession();
    transactionSession = null;

    // Step 1: Transcribe with enhanced service
    await job.updateProgress({ phase: 'transcription', progress: 30 });
    const transcriptionResult = await RAGTranscriptionService.transcribeVideo(
      cloudinaryUrl, 
      videoId, 
      job, 
      language
    );
    
    // Step 2: Generate summary
    await job.updateProgress({ phase: 'summary', progress: 70 });
    let summary = transcriptionResult.summary;
    
    // Step 3: Generate embeddings (optional) with timeout
    await job.updateProgress({ phase: 'embeddings', progress: 90 });
    let embeddings = null;
    try {
      // Set timeout for embedding generation
      const embeddingPromise = generateEmbeddings(transcriptionResult.transcript);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Embedding generation timeout')), 60000)
      );
      
      embeddings = await Promise.race([embeddingPromise, timeoutPromise]);
    } catch (embeddingError) {
      console.warn(`Embedding generation failed: ${embeddingError.message}`);
      // Continue without embeddings - they're optional
    }
    
    // Step 4: Atomic update with comprehensive results
    transactionSession = await mongoose.startSession();
    transactionSession.startTransaction();

    const updatedVideo = await Video.findByIdAndUpdate(
      videoId,
      {
        status: 'completed',
        transcript: transcriptionResult.transcript,
        summary,
        embeddings,
        duration: transcriptionResult.duration,
        wordCount: transcriptionResult.wordCount,
        processedAt: new Date()
      },
      { 
        new: true,
        runValidators: true,
        session: transactionSession
      }
    );

    if (!updatedVideo) {
      throw new Error(`Failed to update video ${videoId} after processing`);
    }

    await transactionSession.commitTransaction();
    await transactionSession.endSession();
    transactionSession = null;

    await job.updateProgress({ phase: 'completed', progress: 100 });
    
    console.log(`[EnhancedVideoProcessor] ✅ Completed: ${transcriptionResult.wordCount} words for video ${videoId}`);
    
    return { 
      videoId, 
      duration: transcriptionResult.duration,
      transcriptLength: transcriptionResult.transcript.length,
      summaryLength: summary.length,
      wordCount: transcriptionResult.wordCount,
      chunkCount: transcriptionResult.chunkCount
    };
    
  } catch (error) {
    console.error(`[EnhancedVideoProcessor] ❌ Error processing job ${job?.id}:`, error);

    // Cleanup transaction if it's still open
    if (transactionSession) {
      try {
        await transactionSession.abortTransaction();
        await transactionSession.endSession();
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    }

    // Update video status to failed with error details
    if (video && video._id) {
      try {
        await atomicVideoUpdate(video._id, {
          status: 'failed',
          error: error.message.substring(0, 500), // Limit error message length
          processedAt: new Date()
        });
      } catch (updateError) {
        console.error('Failed to update video status to failed:', updateError);
      }
    }

    // Re-throw the error for BullMQ to handle
    throw error;
  } finally {
    // Always clean up the session
    if (transactionSession) {
      try {
        await transactionSession.endSession();
      } catch (sessionError) {
        console.error('Error ending session:', sessionError);
      }
    }
  }
};

// Enhanced worker configuration
export const workerOptions = {
  connection: redisClient,
  concurrency: Math.max(1, Math.min(5, parseInt(process.env.WORKER_CONCURRENCY) || 1)),
  removeOnComplete: {
    age: 24 * 3600, // keep up to 24 hours
    count: 1000, // keep up to 1000 jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // keep up to 7 days
  },
  lockDuration: parseInt(process.env.WORKER_LOCK_DURATION) || 1800000, // 30 minutes
  stalledInterval: parseInt(process.env.WORKER_STALLED_INTERVAL) || 600000, // 10 minutes
  maxStalledCount: 3, // Max times a job can be stalled before failing
  settings: {
    maxWorkerCount: 10, // Maximum number of workers that can run simultaneously
    drainDelay: 5, // Time to wait before draining
  }
};

// Create worker instance
export const videoProcessorWorker = new Worker('video-processing', processVideo, workerOptions);

// Enhanced worker event handlers with better logging
videoProcessorWorker.on('completed', (job) => {
  console.log(`[EnhancedVideoProcessor] ✅ Job ${job.id} completed successfully`);
});

videoProcessorWorker.on('failed', (job, err) => {
  console.error(`[EnhancedVideoProcessor] ❌ Job ${job?.id} failed:`, {
    error: err.message,
    stack: err.stack,
    jobData: job?.data ? {
      videoId: job.data.videoId,
      hasCloudinaryUrl: !!job.data.cloudinaryUrl
    } : 'No job data'
  });
});

videoProcessorWorker.on('error', (err) => {
  console.error('[EnhancedVideoProcessor] Worker error:', {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
});

videoProcessorWorker.on('stalled', (jobId) => {
  console.warn(`[EnhancedVideoProcessor] Job ${jobId} stalled`);
});

videoProcessorWorker.on('active', (job) => {
  console.log(`[EnhancedVideoProcessor] Job ${job.id} is now active`);
});

videoProcessorWorker.on('closing', () => {
  console.log('[EnhancedVideoProcessor] Worker is closing...');
});

videoProcessorWorker.on('closed', () => {
  console.log('[EnhancedVideoProcessor] Worker closed');
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down worker gracefully...`);
  
  try {
    await videoProcessorWorker.close();
    console.log('✅ Video processor worker shut down gracefully');
  } catch (error) {
    console.error('❌ Error shutting down worker:', error);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('✅ Enhanced Video processor worker started with concurrency:', workerOptions.concurrency);