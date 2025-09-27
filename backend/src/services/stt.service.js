import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

class STTService {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.baseURL = 'https://api-inference.huggingface.co/models';
    this.model = 'openai/whisper-large-v3';
    this.timeout = 30000;
    this.maxRetries = 3;
  }

  async transcribeAudioChunk(audioPath, language = 'english') {
    if (!this.apiKey) {
      throw new Error('Hugging Face API key not configured');
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔊 Transcribing chunk (attempt ${attempt}): ${audioPath}`);

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
            timeout: this.timeout
          }
        );

        if (response.data && response.data.text) {
          return response.data.text.trim();
        } else {
          throw new Error('Invalid response format from STT service');
        }
      } catch (error) {
        console.warn(`STT attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw new Error(`STT transcription failed after ${this.maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  async transcribeAudioChunks(chunks, language = 'english') {
    const transcriptions = [];

    for (const chunk of chunks) {
      try {
        const text = await this.transcribeAudioChunk(chunk.path, language);
        transcriptions.push({
          text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          chunkIndex: chunk.index
        });
        
        console.log(`✅ Chunk ${chunk.index} transcribed: ${text.substring(0, 100)}...`);
      } catch (error) {
        console.error(`Failed to transcribe chunk ${chunk.index}:`, error.message);
        transcriptions.push({
          text: `[Transcription failed for this segment: ${error.message}]`,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          chunkIndex: chunk.index,
          error: true
        });
      }
    }

    return transcriptions;
  }

  getLanguageCode(language) {
    const languageMap = {
      'english': 'en',
      'spanish': 'es',
      'french': 'fr',
      'german': 'de',
      'italian': 'it',
      'portuguese': 'pt',
      'russian': 'ru',
      'chinese': 'zh',
      'japanese': 'ja',
      'korean': 'ko',
      'hindi': 'hi',
      'arabic': 'ar'
    };
    
    return languageMap[language.toLowerCase()] || 'en';
  }

  async checkModelStatus() {
    try {
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
        status: 'loaded'
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        status: 'unavailable'
      };
    }
  }
}

export default new STTService();