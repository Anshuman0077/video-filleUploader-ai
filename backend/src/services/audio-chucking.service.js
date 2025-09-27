import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { TEMP_DIR } from '../middleware/upload.middleware.js';
import { v4 as uuidv4 } from 'uuid';

const sleep = promisify(setTimeout);

class AudioChunkingService {
  constructor() {
    this.chunkDuration = Number(process.env.AUTO_CHUNK_DURATION) || 30; // seconds
    this.maxChunkSize = 25 * 1024 * 1024; // 25MB
  }

  // Extract audio from video
  async extractAudio(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
      const audioFileName = `audio_${uuidv4()}.wav`;
      const audioPath = path.join(outputDir, audioFileName);

      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .on('end', () => resolve(audioPath))
        .on('error', (err) => reject(new Error(`Audio extraction failed: ${err.message}`)))
        .run();
    });
  }

  // Get audio duration
  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to get audio duration: ${err.message}`));
        } else {
          resolve(metadata.format.duration);
        }
      });
    });
  }

  // Split audio into chunks
  async splitAudioIntoChunks(audioPath, outputDir) {
    const duration = await this.getAudioDuration(audioPath);
    const totalChunks = Math.ceil(duration / this.chunkDuration);
    const chunks = [];

    console.log(`🎵 Splitting audio into ${totalChunks} chunks (${this.chunkDuration}s each)`);

    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * this.chunkDuration;
      const chunkFileName = `chunk_${i}_${uuidv4()}.wav`;
      const chunkPath = path.join(outputDir, chunkFileName);

      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .output(chunkPath)
          .setStartTime(startTime)
          .setDuration(this.chunkDuration)
          .on('end', () => {
            chunks.push({
              path: chunkPath,
              index: i,
              startTime: startTime,
              endTime: Math.min(startTime + this.chunkDuration, duration),
              duration: Math.min(this.chunkDuration, duration - startTime)
            });
            resolve();
          })
          .on('error', reject)
          .run();
      });

      // Small delay to prevent overloading the system
      await sleep(100);
    }

    return chunks;
  }

  // Cleanup audio files
  cleanupFiles(filePaths) {
    filePaths.forEach(filePath => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.warn(`Could not delete file: ${filePath}`, error.message);
        }
      }
    });
  }

  // Process video and return chunk information
  async processVideoForChunking(videoPath) {
    let audioPath = null;
    let chunks = [];

    try {
      // Extract audio
      audioPath = await this.extractAudio(videoPath, path.dirname(videoPath));
      
      // Split into chunks
      chunks = await this.splitAudioIntoChunks(audioPath, path.dirname(videoPath));
      
      return {
        audioPath,
        chunks,
        totalDuration: await this.getAudioDuration(audioPath),
        totalChunks: chunks.length
      };
    } catch (error) {
      // Cleanup on error
      this.cleanupFiles([audioPath, ...chunks.map(c => c.path)]);
      throw error;
    }
  }
}

export default new AudioChunkingService();