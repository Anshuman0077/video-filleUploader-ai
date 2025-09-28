import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { validateEnvVar } from '../config/env.js';

// Enhanced STT Service with comprehensive error handling
class STTService {
  constructor() {
    this.initializeService();
  }

  initializeService() {
    try {
      this.apiKey = process.env.HUGGINGFACE_API_KEY;
      this.baseURL = 'https://api-inference.huggingface.co/models';
      this.model = 'openai/whisper-large-v3';
      this.timeout = parseInt(process.env.STT_TIMEOUT_MS) || 60000;
      this.maxRetries = parseInt(process.env.STT_MAX_RETRIES) || 3;
      this.maxFileSize = 25 * 1024 * 1024; // 25MB
      
      console.log('🔧 STT Service initialized:', {
        hasApiKey: !!this.apiKey,
        model: this.model,
        timeout: `${this.timeout}ms`,
        maxRetries: this.maxRetries
      });
    } catch (error) {
      console.error('❌ STT Service initialization failed:', error);
      this.apiKey = null;
    }
  }

  async validateAudioFile(audioPath) {
    if (!audioPath || typeof audioPath !== 'string') {
      throw new Error('Audio path must be a valid string');
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const stats = fs.statSync(audioPath);
    if (stats.size === 0) {
      throw new Error('Audio file is empty');
    }

    if (stats.size > this.maxFileSize) {
      throw new Error(`Audio file too large: ${(stats.size / (1024 * 1024)).toFixed(2)}MB > ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Validate file extension
    const allowedExtensions = ['.wav', '.mp3', '.m4a', '.flac'];
    const ext = path.extname(audioPath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`Unsupported audio format: ${ext}. Supported: ${allowedExtensions.join(', ')}`);
    }

    return stats;
  }

  async transcribeAudioChunk(audioPath, language = 'english') {
    // Enhanced API key validation
    if (!this.apiKey) {
      throw new Error('Hugging Face API key not configured for STT service');
    }

    await this.validateAudioFile(audioPath);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔊 Transcribing chunk (attempt ${attempt}): ${path.basename(audioPath)}`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', this.model);
        formData.append('language', this.getLanguageCode(language));
        formData.append('response_format', 'json');

        const response = await axios.post(
          `${this.baseURL}/${this.model}`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              ...formData.getHeaders()
            },
            timeout: this.timeout,
            maxContentLength: this.maxFileSize
          }
        );

        if (response.data && response.data.text) {
          const transcription = response.data.text.trim();
          console.log(`✅ Chunk transcribed: ${transcription.substring(0, 100)}...`);
          return transcription;
        } else {
          throw new Error('Invalid response format from STT service');
        }
      } catch (error) {
        console.warn(`❌ STT attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw new Error(`STT transcription failed after ${this.maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async transcribeAudioChunks(chunks, language = 'english') {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('Invalid chunks array provided');
    }

    const transcriptions = [];
    let successfulChunks = 0;

    console.log(`\n🎯 Starting transcription of ${chunks.length} chunks`);

    for (const chunk of chunks) {
      try {
        console.log(`\n📝 Processing chunk ${chunk.index + 1}/${chunks.length}`);
        
        const text = await this.transcribeAudioChunk(chunk.path, language);
        
        transcriptions.push({
          text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          chunkIndex: chunk.index,
          error: false,
          timestamp: new Date().toISOString()
        });
        
        successfulChunks++;
        console.log(`🎉 Chunk ${chunk.index} completed (${successfulChunks}/${chunks.length})`);
        
      } catch (error) {
        console.error(`❌ Failed to transcribe chunk ${chunk.index}:`, error.message);
        transcriptions.push({
          text: `[Audio segment ${this.formatTimestamp(chunk.startTime)}-${this.formatTimestamp(chunk.endTime)} could not be transcribed: ${error.message}]`,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          chunkIndex: chunk.index,
          error: true,
          errorMessage: error.message
        });
      }
    }

    console.log(`\n📊 Transcription summary: ${successfulChunks}/${chunks.length} chunks successful`);
    
    return {
      transcriptions,
      summary: {
        totalChunks: chunks.length,
        successfulChunks,
        failedChunks: chunks.length - successfulChunks,
        successRate: (successfulChunks / chunks.length) * 100
      }
    };
  }

  formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }

  getLanguageCode(language) {
    const languageMap = {
      'english': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de',
      'italian': 'it', 'portuguese': 'pt', 'russian': 'ru', 'chinese': 'zh',
      'japanese': 'ja', 'korean': 'ko', 'hindi': 'hi', 'arabic': 'ar'
    };
    
    return languageMap[language.toLowerCase()] || 'en';
  }

  async checkModelStatus() {
    try {
      if (!this.apiKey) {
        return {
          available: false,
          error: 'API key not configured',
          status: 'unavailable'
        };
      }

      const response = await axios.get(
        `${this.baseURL}/${this.model}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 10000
        }
      );

      return {
        available: true,
        model: response.data.modelId,
        status: 'loaded',
        details: response.data
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        status: 'unavailable'
      };
    }
  }

  // Health check method
  async healthCheck() {
    const modelStatus = await this.checkModelStatus();
    
    return {
      service: 'stt',
      status: modelStatus.available ? 'healthy' : 'unhealthy',
      model: this.model,
      api_configured: !!this.apiKey,
      model_available: modelStatus.available,
      details: modelStatus
    };
  }
}

export default new STTService();