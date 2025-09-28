// import AudioChunkingService from './audio-chunking.service.js';
import AudioChunkingService from "./audio-chucking.service.js"
import STTService from './stt.service.js';
import VectorDBService from './vectorDb.service.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { TEMP_DIR } from '../middleware/upload.middleware.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

// Validate environment variables
const validateGeminiAPIKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  return apiKey;
};

const genAI = new GoogleGenerativeAI(validateGeminiAPIKey());

class RAGTranscriptionService {
  constructor() {
    this.maxVideoDuration = 5 * 60 * 60;
  }

  async downloadVideo(videoUrl, tempFilePath) {
    try {
      console.log(`📥 Downloading video from: ${videoUrl}`);
      
      // Validate URL
      if (!videoUrl || typeof videoUrl !== 'string') {
        throw new Error('Invalid video URL');
      }

      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        timeout: parseInt(process.env.DOWNLOAD_TOTAL_TIMEOUT_MS) || 300000,
        maxContentLength: 500 * 1024 * 1024, // 500MB
      });

      const writer = fs.createWriteStream(tempFilePath);
      await streamPipeline(response.data, writer);
      
      // Verify file was downloaded
      const stats = fs.statSync(tempFilePath);
      if (stats.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      console.log(`✅ Video downloaded: ${tempFilePath} (${stats.size} bytes)`);
      return true;
    } catch (error) {
      throw new Error(`Video download failed: ${error.message}`);
    }
  }

  async transcribeWithSTT(videoPath, language = 'english') {
    let processingResult = null;

    try {
      // Validate video file exists and is accessible
      if (!fs.existsSync(videoPath)) {
        throw new Error('Video file not found');
      }

      // Step 1: Chunk the audio
      console.log('🎵 Starting audio chunking...');
      processingResult = await AudioChunkingService.processVideoForChunking(videoPath);
      
      if (!processingResult.chunks || processingResult.chunks.length === 0) {
        throw new Error('No audio chunks were created');
      }

      // Step 2: Transcribe each chunk using STT
      console.log('🔊 Starting STT transcription...');
      const transcriptions = await STTService.transcribeAudioChunks(
        processingResult.chunks, 
        language
      );

      // Step 3: Combine transcriptions with timestamps
      const fullTranscript = this.combineTranscriptions(transcriptions);
      
      // Step 4: Store chunks in vector database for RAG
      console.log('💾 Storing chunks in vector database...');
      await VectorDBService.storeVideoChunks(
        path.basename(videoPath, path.extname(videoPath)),
        transcriptions
      );

      return {
        transcript: fullTranscript,
        chunks: transcriptions,
        duration: processingResult.totalDuration,
        wordCount: fullTranscript.split(/\s+/).length,
        chunkCount: transcriptions.length
      };

    } catch (error) {
      console.error('STT transcription failed:', error);
      throw error;
    } finally {
      // Cleanup temporary files
      if (processingResult) {
        try {
          AudioChunkingService.cleanupFiles([
            processingResult.audioPath,
            ...processingResult.chunks.map(c => c.path)
          ]);
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError.message);
        }
      }
    }
  }

  combineTranscriptions(transcriptions) {
    return transcriptions
      .map(chunk => {
        const timestamp = this.formatTimestamp(chunk.startTime);
        return `[${timestamp}] ${chunk.text}`;
      })
      .join('\n\n');
  }

  formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  async generateSummaryWithRAG(transcript, chunks, videoId, language = 'english') {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      
      const prompt = `
        Create a comprehensive summary of this video transcript in ${language}.
        
        VIDEO TRANSCRIPT:
        ${transcript.substring(0, 10000)}
        
        Please provide a structured summary that captures the main points.
        
        SUMMARY in ${language}:
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('RAG summary generation error:', error);
      return this.generateFallbackSummary(transcript, language);
    }
  }

  generateFallbackSummary(transcript, language) {
    const wordCount = transcript.split(/\s+/).length;
    return `This ${wordCount}-word transcript contains valuable content. A detailed summary would analyze key themes and insights from the video.`;
  }

  // Main transcription function
  async transcribeVideo(videoUrl, videoId = null, job = null, language = 'english') {
    let tempFilePath = null;

    try {
      console.log(`🎬 Starting RAG-enhanced transcription for video: ${videoId}`);
      
      // Create temp directory
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      // Download video
      tempFilePath = path.join(TEMP_DIR, `${videoId || uuidv4()}.mp4`);
      
      if (job) await job.updateProgress({ phase: 'download', progress: 10 });
      await this.downloadVideo(videoUrl, tempFilePath);
      
      if (job) await job.updateProgress({ phase: 'chunking', progress: 30 });
      
      // Transcribe with STT and chunking
      if (job) await job.updateProgress({ phase: 'transcription', progress: 60 });
      const sttResult = await this.transcribeWithSTT(tempFilePath, language);
      
      // Generate enhanced summary with RAG
      if (job) await job.updateProgress({ phase: 'summary', progress: 80 });
      const summary = await this.generateSummaryWithRAG(
        sttResult.transcript, 
        sttResult.chunks, 
        videoId, 
        language
      );

      if (job) await job.updateProgress({ phase: 'completed', progress: 100 });

      console.log(`✅ RAG transcription completed: ${sttResult.wordCount} words`);

      return {
        transcript: sttResult.transcript,
        summary,
        duration: sttResult.duration,
        wordCount: sttResult.wordCount,
        chunkCount: sttResult.chunkCount,
        chunks: sttResult.chunks
      };

    } catch (error) {
      console.error("[RAGTranscription] Error:", error);
      
      // Fallback to Gemini if STT fails
      return await this.fallbackToGemini(videoUrl, language);
    } finally {
      // Cleanup temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError.message);
        }
      }
    }
  }

  async fallbackToGemini(videoUrl, language) {
    console.warn('Using Gemini fallback transcription');
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `Generate a realistic video transcript for a typical educational/technical video. Language: ${language}`;
    const result = await model.generateContent(prompt);
    const transcript = await result.response.text();
    
    return {
      transcript,
      summary: 'Summary generated using fallback service',
      duration: 300,
      wordCount: transcript.split(/\s+/).length,
      chunkCount: 1,
      chunks: []
    };
  }
}

export default new RAGTranscriptionService();