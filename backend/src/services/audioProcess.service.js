import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Enhanced FFmpeg configuration
try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  console.log('✅ FFmpeg configured for audio processing');
} catch (error) {
  console.error('❌ FFmpeg configuration failed:', error);
  throw new Error('FFmpeg is required for audio processing');
}

const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

class AudioProcessor {
  static async validateAudioFile(audioPath) {
    if (!audioPath || typeof audioPath !== 'string') {
      throw new Error('Audio path must be a valid string');
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const stats = await statAsync(audioPath);
    if (stats.size === 0) {
      throw new Error('Audio file is empty');
    }

    // Check if it's an audio file by extension
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.flac', '.aac'];
    const ext = path.extname(audioPath).toLowerCase();
    if (!audioExtensions.includes(ext)) {
      console.warn(`⚠️ File extension ${ext} may not be an audio file`);
    }

    return stats;
  }

  static async extractAudioFromVideo(videoPath, outputDir, options = {}) {
    try {
      console.log(`🎬 Extracting audio from video: ${path.basename(videoPath)}`);

      // Validate inputs
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
      }

      const outputFileName = `audio_${Date.now()}.wav`;
      const outputPath = path.join(outputDir, outputFileName);

      return new Promise((resolve, reject) => {
        const command = ffmpeg(videoPath)
          .output(outputPath)
          .audioCodec('pcm_s16le')
          .audioFrequency(16000)
          .audioChannels(1)
          .format('wav');

        // Enhanced options
        if (options.maxDuration) {
          command.duration(options.maxDuration);
          console.log(`⏱️ Limiting extraction to ${options.maxDuration} seconds`);
        }

        if (options.bitrate) {
          command.audioBitrate(options.bitrate);
        }

        let hasCompleted = false;

        // Timeout handling
        const timeout = setTimeout(() => {
          if (!hasCompleted) {
            command.kill('SIGTERM');
            reject(new Error('Audio extraction timeout (10 minutes exceeded)'));
          }
        }, 600000); // 10 minutes

        command
          .on('start', (commandLine) => {
            if (process.env.NODE_ENV === 'development') {
              console.log('FFmpeg command:', commandLine);
            }
          })
          .on('end', async () => {
            clearTimeout(timeout);
            hasCompleted = true;

            try {
              if (fs.existsSync(outputPath)) {
                const stats = await statAsync(outputPath);
                console.log(`✅ Audio extraction completed: ${path.basename(outputPath)} (${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);
                resolve(outputPath);
              } else {
                reject(new Error('Output audio file was not created'));
              }
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (err) => {
            clearTimeout(timeout);
            hasCompleted = true;
            console.error('❌ Audio extraction error:', err);
            reject(new Error(`Audio extraction failed: ${err.message}`));
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              console.log(`📊 Extraction progress: ${Math.round(progress.percent)}%`);
            }
          })
          .run();
      });

    } catch (error) {
      console.error('❌ Audio extraction failed:', error);
      throw error;
    }
  }

  static async getVideoDuration(videoPath) {
    try {
      await this.validateAudioFile(videoPath); // Reuse validation for video files

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
          if (err) {
            reject(new Error(`Failed to get video duration: ${err.message}`));
          } else {
            const duration = metadata.format.duration || 0;
            resolve(duration);
          }
        });
      });
    } catch (error) {
      console.error('❌ Duration check failed:', error);
      throw error;
    }
  }

  static async getAudioDuration(audioPath) {
    try {
      await this.validateAudioFile(audioPath);

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
    } catch (error) {
      console.error('❌ Audio duration check failed:', error);
      throw error;
    }
  }

  static async splitAudioForLongVideos(audioPath, segmentDuration = 600) { // 10 minutes segments
    try {
      await this.validateAudioFile(audioPath);

      const duration = await this.getAudioDuration(audioPath);
      
      if (duration <= segmentDuration) {
        console.log(`⏱️ No need to split audio (${duration.toFixed(2)}s <= ${segmentDuration}s)`);
        return [audioPath];
      }

      const segments = [];
      const segmentCount = Math.ceil(duration / segmentDuration);
      
      console.log(`✂️ Splitting ${duration.toFixed(2)}s audio into ${segmentCount} segments`);

      for (let i = 0; i < segmentCount; i++) {
        const segmentPath = await this.extractAudioSegment(audioPath, i, segmentDuration);
        segments.push(segmentPath);
      }

      console.log(`✅ Audio split into ${segments.length} segments`);
      return segments;

    } catch (error) {
      console.error('❌ Audio splitting failed:', error);
      throw error;
    }
  }

  static async extractAudioSegment(audioPath, segmentIndex, segmentDuration) {
    return new Promise((resolve, reject) => {
      const segmentPath = audioPath.replace('.wav', `_segment_${segmentIndex}.wav`);
      const startTime = segmentIndex * segmentDuration;

      console.log(`🔪 Extracting segment ${segmentIndex + 1}: ${startTime}s - ${startTime + segmentDuration}s`);

      ffmpeg(audioPath)
        .output(segmentPath)
        .setStartTime(startTime)
        .duration(segmentDuration)
        .audioCodec('copy') // Use same codec for faster processing
        .on('end', () => {
          console.log(`✅ Segment ${segmentIndex} created: ${path.basename(segmentPath)}`);
          resolve(segmentPath);
        })
        .on('error', (err) => {
          console.error(`❌ Segment ${segmentIndex} extraction failed:`, err);
          reject(err);
        })
        .run();
    });
  }

  static async cleanupFile(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return;
    }

    try {
      if (fs.existsSync(filePath)) {
        await unlinkAsync(filePath);
        console.log(`🧹 Cleaned up: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.warn('⚠️ Cleanup warning:', {
        file: path.basename(filePath),
        error: error.message
      });
    }
  }

  static async cleanupMultipleFiles(filePaths) {
    if (!Array.isArray(filePaths)) return;

    const cleanupPromises = filePaths.map(filePath => 
      this.cleanupFile(filePath)
    );

    await Promise.allSettled(cleanupPromises);
  }

  // Health check method
  static async healthCheck() {
    try {
      // Test FFmpeg availability and basic functionality
      const testResult = await new Promise((resolve, reject) => {
        ffmpeg.getAvailableFilters((err, filters) => {
          if (err) reject(err);
          else resolve({ availableFilters: Object.keys(filters).length });
        });
      });

      return {
        status: 'healthy',
        ffmpeg: 'available',
        filters: testResult.availableFilters,
        message: 'Audio processor is operational'
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

export default AudioProcessor;