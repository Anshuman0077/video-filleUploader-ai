import { Worker } from 'bullmq';
import Video from '../models/videos.model.js';
import { generateSummary, generateEmbeddings } from '../services/gemini.service.js';
import RAGTranscriptionService from '../services/transcription.service.js'; // Fixed import
import redisClient from '../config/redis.js';

// Process video job with enhanced transcription
const processVideo = async (job) => {
  try {
    const { videoId, cloudinaryUrl, language = 'english' } = job.data;
    
    console.log(`[EnhancedVideoProcessor] Starting processing for video: ${videoId}`);
    
    // Update video status
    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processedAt: new Date()
    });
    
    await job.updateProgress({ phase: 'started', progress: 10 });
    
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
    
    // Step 3: Generate embeddings (optional)
    await job.updateProgress({ phase: 'embeddings', progress: 90 });
    let embeddings = null;
    try {
      embeddings = await generateEmbeddings(transcriptionResult.transcript);
    } catch (embeddingError) {
      console.warn(`Embedding generation failed: ${embeddingError.message}`);
    }
    
    // Step 4: Update video with comprehensive results
    await Video.findByIdAndUpdate(videoId, {
      status: 'completed',
      transcript: transcriptionResult.transcript,
      summary,
      embeddings,
      duration: transcriptionResult.duration,
      wordCount: transcriptionResult.wordCount,
      processedAt: new Date()
    });
    
    await job.updateProgress({ phase: 'completed', progress: 100 });
    
    console.log(`[EnhancedVideoProcessor] ✅ Completed: ${transcriptionResult.wordCount} words`);
    
    return { 
      videoId, 
      duration: transcriptionResult.duration,
      transcriptLength: transcriptionResult.transcript.length,
      summaryLength: summary.length,
      wordCount: transcriptionResult.wordCount
    };
    
  } catch (error) {
    console.error(`[EnhancedVideoProcessor] ❌ Error:`, error);
    
    await Video.findByIdAndUpdate(job.data.videoId, {
      status: 'failed',
      error: error.message.substring(0, 500),
      processedAt: new Date()
    });
    
    throw error;
  }
};

// Create worker instance
export const videoProcessorWorker = new Worker('video-processing', processVideo, {
  connection: redisClient,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 1),
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 25 }
});

// Worker event handlers
videoProcessorWorker.on('completed', (job) => {
  console.log(`[EnhancedVideoProcessor] ✅ Job ${job.id} completed`);
});

videoProcessorWorker.on('failed', (job, err) => {
  console.error(`[EnhancedVideoProcessor] ❌ Job ${job?.id} failed:`, err.message);
});

videoProcessorWorker.on('error', (err) => {
  console.error('[EnhancedVideoProcessor] Worker error:', err);
});

console.log('✅ Enhanced Video processor worker started');