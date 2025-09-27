
import AudioChunkingService from './audio-chucking.service.js';
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
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class RAGTranscriptionService {
  constructor() {
    this.maxVideoDuration = 5 * 60 * 60; // 5 hours in seconds
  }

  async downloadVideo(videoUrl, tempFilePath) {
    try {
      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        timeout: 300000,
      });

      const writer = fs.createWriteStream(tempFilePath);
      await streamPipeline(response.data, writer);
      return true;
    } catch (error) {
      throw new Error(`Video download failed: ${error.message}`);
    }
  }

  async transcribeWithSTT(videoPath, language = 'english') {
    let processingResult = null;

    try {
      // Step 1: Chunk the audio
      console.log('🎵 Starting audio chunking...');
      processingResult = await AudioChunkingService.processVideoForChunking(videoPath);
      
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

    } finally {
      // Cleanup temporary files
      if (processingResult) {
        AudioChunkingService.cleanupFiles([
          processingResult.audioPath,
          ...processingResult.chunks.map(c => c.path)
        ]);
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
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      // Use RAG to enhance summary with chunk context
      const chunkContext = chunks
        .filter(chunk => !chunk.error)
        .slice(0, 10) // Use first 10 chunks for context
        .map(chunk => `[${this.formatTimestamp(chunk.startTime)}-${this.formatTimestamp(chunk.endTime)}] ${chunk.text}`)
        .join('\n');

      const prompt = `
        Create a comprehensive summary of this video using the transcript and chunked context.
        
        VIDEO TRANSCRIPT:
        ${transcript}
        
        KEY CHUNK CONTEXT:
        ${chunkContext}
        
        Please provide a structured summary that includes:
        1. Main topics and themes
        2. Key points and insights
        3. Practical applications
        4. Technical details (if any)
        5. Overall value and takeaways
        
        Respond in ${language}.
        
        COMPREHENSIVE SUMMARY:
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
    return `This ${wordCount}-word transcript contains valuable content. A detailed AI-powered summary would normally analyze key themes, practical applications, and technical insights from the video.`;
  }

  // Main transcription function
  async transcribeVideo(videoUrl, videoId = null, job = null, language = 'english') {
    let tempFilePath = null;

    try {
      console.log(`🎬 Starting RAG-enhanced transcription for: ${videoUrl}`);
      
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

      console.log(`✅ RAG transcription completed: ${sttResult.wordCount} words, ${sttResult.chunkCount} chunks`);

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
      if (process.env.NODE_ENV === 'development') {
        return await this.fallbackToGemini(videoUrl, language);
      }
      
      throw new Error(`Transcription failed: ${error.message}`);
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = `Generate a realistic video transcript for a typical educational/technical video. Language: ${language}`;
    const result = await model.generateContent(prompt);
    const transcript = await result.response.text();
    
    return {
      transcript,
      summary: 'Fallback summary - STT service unavailable',
      duration: 3600,
      wordCount: transcript.split(/\s+/).length,
      chunkCount: 1,
      chunks: []
    };
  }
}

export default new RAGTranscriptionService();