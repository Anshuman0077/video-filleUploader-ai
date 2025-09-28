import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Enhanced FFmpeg configuration
try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  console.log('✅ FFmpeg configured for audio conversion');
} catch (error) {
  console.error('❌ FFmpeg configuration failed:', error);
  throw new Error('FFmpeg is required for audio conversion');
}

const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

class AudioConverter {
  static async validateInputFile(videoPath) {
    if (!videoPath || typeof videoPath !== 'string') {
      throw new Error('Video path must be a valid string');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const stats = await statAsync(videoPath);
    if (stats.size === 0) {
      throw new Error('Video file is empty');
    }

    // Check file size limit (500MB)
    if (stats.size > 500 * 1024 * 1024) {
      throw new Error('Video file exceeds maximum size limit of 500MB');
    }

    return stats;
  }

  static async validateOutputDirectory(outputDir) {
    if (!outputDir || typeof outputDir !== 'string') {
      throw new Error('Output directory must be a valid string');
    }

    try {
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
        console.log(`📁 Created output directory: ${outputDir}`);
      }

      // Check if directory is writable
      const testFile = path.join(outputDir, `.test-${Date.now()}`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      return true;
    } catch (error) {
      throw new Error(`Output directory is not writable: ${outputDir} - ${error.message}`);
    }
  }

  static async convertVideoToAudio(videoPath, outputDir, options = {}) {
    // Validate inputs
    await this.validateInputFile(videoPath);
    await this.validateOutputDirectory(outputDir);

    const outputFileName = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.wav`;
    const outputPath = path.join(outputDir, outputFileName);

    return new Promise((resolve, reject) => {
      console.log(`🎵 Converting video to audio: ${path.basename(videoPath)}`);

      const command = ffmpeg(videoPath)
        .output(outputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .outputOptions([
          '-ac 1',
          '-ar 16000'
        ]);

      // Add optional parameters
      if (options.maxDuration) {
        command.duration(options.maxDuration);
      }

      if (options.bitrate) {
        command.audioBitrate(options.bitrate);
      }

      let hasEnded = false;

      const cleanup = () => {
        if (!hasEnded && fs.existsSync(outputPath)) {
          unlinkAsync(outputPath).catch(() => {});
        }
      };

      const timeout = setTimeout(() => {
        command.kill('SIGTERM');
        cleanup();
        reject(new Error('Audio conversion timeout (5 minutes exceeded)'));
      }, 300000); // 5 minutes

      command
        .on('start', (commandLine) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('FFmpeg command:', commandLine);
          }
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 Conversion progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          clearTimeout(timeout);
          hasEnded = true;

          try {
            if (fs.existsSync(outputPath)) {
              const stats = await statAsync(outputPath);
              console.log(`✅ Audio conversion completed: ${path.basename(outputPath)} (${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);
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
          cleanup();
          console.error('❌ Audio conversion error:', err);
          reject(new Error(`Audio conversion failed: ${err.message}`));
        })
        .on('stderr', (stderr) => {
          if (process.env.NODE_ENV === 'development' && stderr) {
            console.log('FFmpeg stderr:', stderr.substring(0, 200));
          }
        })
        .run();
    });
  }

  static async extractAudioFromVideo(videoPath, outputDir, options = {}) {
    try {
      console.log(`🎬 Starting audio extraction from: ${path.basename(videoPath)}`);

      // Enhanced validation
      const videoStats = await this.validateInputFile(videoPath);
      console.log(`📊 Video details: ${(videoStats.size / (1024 * 1024)).toFixed(2)}MB`);

      const audioPath = await this.convertVideoToAudio(videoPath, outputDir, options);
      
      // Verify the output file
      const audioStats = await statAsync(audioPath);
      if (audioStats.size === 0) {
        await this.cleanupAudioFile(audioPath);
        throw new Error('Generated audio file is empty');
      }

      console.log(`✅ Audio extraction successful: ${path.basename(audioPath)}`);
      return audioPath;

    } catch (error) {
      console.error('❌ Audio extraction error:', {
        error: error.message,
        videoPath: path.basename(videoPath),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  static async cleanupAudioFile(audioPath) {
    if (!audioPath || typeof audioPath !== 'string') {
      return;
    }

    try {
      if (fs.existsSync(audioPath)) {
        await unlinkAsync(audioPath);
        console.log(`🧹 Cleaned up audio file: ${path.basename(audioPath)}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not cleanup audio file:', {
        file: path.basename(audioPath),
        error: error.message
      });

      // Schedule retry cleanup
      setTimeout(() => {
        try {
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
            console.log('✅ Retry cleanup successful for:', path.basename(audioPath));
          }
        } catch (retryError) {
          console.error('❌ Retry cleanup failed:', retryError.message);
        }
      }, 5000);
    }
  }

  static async cleanupMultipleFiles(filePaths) {
    if (!Array.isArray(filePaths)) return;

    const cleanupPromises = filePaths.map(filePath => 
      this.cleanupAudioFile(filePath)
    );

    await Promise.allSettled(cleanupPromises);
  }

  // Health check method
  static async healthCheck() {
    try {
      // Test FFmpeg availability
      await new Promise((resolve, reject) => {
        ffmpeg.getAvailableCodecs((err, codecs) => {
          if (err) reject(err);
          else resolve(codecs);
        });
      });

      return {
        status: 'healthy',
        ffmpeg: 'available',
        message: 'Audio converter is operational'
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

export default AudioConverter;