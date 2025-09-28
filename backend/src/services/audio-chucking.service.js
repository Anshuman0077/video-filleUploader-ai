import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

// Enhanced FFmpeg configuration with validation
try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  console.log('✅ FFmpeg path configured:', ffmpegInstaller.path);
} catch (error) {
  console.error('❌ FFmpeg configuration failed:', error);
  throw new Error('FFmpeg is required for audio processing');
}

const sleep = promisify(setTimeout);
const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

class AudioChunkingService {
  constructor() {
    this.chunkDuration = Math.max(10, Math.min(300, Number(process.env.AUTO_CHUNK_DURATION) || 30));
    this.maxChunkSize = 25 * 1024 * 1024;
    this.maxRetries = 3;
  }

  // Enhanced file validation
  async validateVideoFile(videoPath) {
    if (!videoPath || typeof videoPath !== 'string') {
      throw new Error('Invalid video path');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const stats = await statAsync(videoPath);
    if (stats.size === 0) {
      throw new Error('Video file is empty');
    }

    if (stats.size > 500 * 1024 * 1024) {
      throw new Error('Video file too large');
    }

    return stats;
  }

  async extractAudio(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
      const audioFileName = `audio_${uuidv4()}.wav`;
      const audioPath = path.join(outputDir, audioFileName);

      console.log(`🎵 Extracting audio from: ${path.basename(videoPath)}`);

      const command = ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .outputOptions([
          '-ac 1',
          '-ar 16000'
        ]);

      command
        .on('start', (commandLine) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('FFmpeg command:', commandLine);
          }
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Audio extraction: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          try {
            if (fs.existsSync(audioPath)) {
              const stats = await statAsync(audioPath);
              console.log(`✅ Audio extracted: ${(stats.size / (1024 * 1024)).toFixed(2)}MB`);
              resolve(audioPath);
            } else {
              reject(new Error('Audio file was not created'));
            }
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (err) => {
          console.error('❌ Audio extraction failed:', err);
          reject(new Error(`Audio extraction failed: ${err.message}`));
        })
        .on('stderr', (stderr) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('FFmpeg stderr:', stderr);
          }
        });

      // Set timeout for extraction
      command.run();
      
      // Timeout handling
      const timeout = setTimeout(() => {
        command.kill('SIGTERM');
        reject(new Error('Audio extraction timeout'));
      }, 300000); // 5 minutes

      command.on('end', () => clearTimeout(timeout));
      command.on('error', () => clearTimeout(timeout));
    });
  }

  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to get audio duration: ${err.message}`));
        } else {
          const duration = metadata.format.duration || 0;
          resolve(duration);
        }
      });
    });
  }

  async splitAudioIntoChunks(audioPath, outputDir) {
    let duration;
    try {
      duration = await this.getAudioDuration(audioPath);
      
      if (duration === 0) {
        throw new Error('Audio file has zero duration');
      }

      const totalChunks = Math.ceil(duration / this.chunkDuration);
      const chunks = [];

      console.log(`🎵 Splitting ${duration.toFixed(2)}s audio into ${totalChunks} chunks`);

      for (let i = 0; i < totalChunks; i++) {
        const startTime = i * this.chunkDuration;
        const chunkDuration = Math.min(this.chunkDuration, duration - startTime);
        
        if (chunkDuration <= 0) continue;

        const chunkFileName = `chunk_${i}_${uuidv4()}.wav`;
        const chunkPath = path.join(outputDir, chunkFileName);

        await new Promise((resolve, reject) => {
          ffmpeg(audioPath)
            .output(chunkPath)
            .setStartTime(startTime)
            .setDuration(chunkDuration)
            .audioCodec('pcm_s16le')
            .audioFrequency(16000)
            .audioChannels(1)
            .on('end', async () => {
              try {
                if (fs.existsSync(chunkPath)) {
                  const stats = await statAsync(chunkPath);
                  chunks.push({
                    path: chunkPath,
                    index: i,
                    startTime: startTime,
                    endTime: startTime + chunkDuration,
                    duration: chunkDuration,
                    size: stats.size
                  });
                  console.log(`✅ Chunk ${i} created: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
                  resolve();
                } else {
                  reject(new Error(`Chunk file not created: ${chunkPath}`));
                }
              } catch (error) {
                reject(error);
              }
            })
            .on('error', reject)
            .run();
        });

        await sleep(100); // Small delay to prevent system overload
      }

      return chunks;
    } catch (error) {
      console.error('❌ Audio chunking failed:', error);
      throw error;
    }
  }

  async processVideoForChunking(videoPath) {
    let audioPath = null;
    let chunks = [];

    try {
      // Enhanced validation
      await this.validateVideoFile(videoPath);

      console.log(`📹 Processing video: ${path.basename(videoPath)}`);
      const stats = await statAsync(videoPath);
      console.log(`📊 Video size: ${(stats.size / (1024 * 1024)).toFixed(2)}MB`);

      // Extract audio with retry logic
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          audioPath = await this.extractAudio(videoPath, path.dirname(videoPath));
          break;
        } catch (error) {
          if (attempt === this.maxRetries) {
            throw error;
          }
          console.log(`🔄 Retry ${attempt} for audio extraction...`);
          await sleep(2000 * attempt);
        }
      }

      // Split audio into chunks
      chunks = await this.splitAudioIntoChunks(audioPath, path.dirname(videoPath));
      
      const totalDuration = await this.getAudioDuration(audioPath);
      
      return {
        audioPath,
        chunks,
        totalDuration,
        totalChunks: chunks.length,
        videoStats: stats
      };
    } catch (error) {
      // Enhanced cleanup on error
      await this.cleanupFiles([audioPath, ...chunks.map(c => c.path)]);
      throw error;
    }
  }

  async cleanupFiles(filePaths) {
    if (!Array.isArray(filePaths)) return;

    const cleanupPromises = filePaths.map(async (filePath) => {
      if (filePath && typeof filePath === 'string') {
        try {
          if (fs.existsSync(filePath)) {
            await unlinkAsync(filePath);
            console.log(`🧹 Cleaned up: ${path.basename(filePath)}`);
          }
        } catch (error) {
          console.warn(`⚠️ Could not delete: ${filePath} - ${error.message}`);
        }
      }
    });

    await Promise.allSettled(cleanupPromises);
  }

  // Health check method
  async healthCheck() {
    try {
      // Test FFmpeg availability
      await new Promise((resolve, reject) => {
        ffmpeg.getAvailableFormats((err, formats) => {
          if (err) reject(err);
          else resolve(formats);
        });
      });

      return {
        status: 'healthy',
        ffmpeg: 'available',
        chunkDuration: this.chunkDuration
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        ffmpeg: 'unavailable',
        error: error.message
      };
    }
  }
}

export default new AudioChunkingService();