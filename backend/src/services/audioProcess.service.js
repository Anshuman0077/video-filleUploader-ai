import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class AudioProcessor {
  static async extractAudioFromVideo(videoPath, outputDir, options = {}) {
    return new Promise((resolve, reject) => {
      const outputFileName = `audio_${Date.now()}.wav`;
      const outputPath = path.join(outputDir, outputFileName);

      const command = ffmpeg(videoPath)
        .output(outputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav');

      // Add duration limit if specified (for very long videos)
      if (options.maxDuration) {
        command.duration(options.maxDuration);
      }

      command
        .on('end', () => {
          console.log(`✅ Audio extraction completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ Audio extraction error:', err);
          reject(new Error(`Audio extraction failed: ${err.message}`));
        })
        .on('progress', (progress) => {
          console.log(`📊 Audio extraction: ${progress.percent}%`);
        })
        .run();
    });
  }

  static async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(metadata.format.duration);
      });
    });
  }

  static async splitAudioForLongVideos(audioPath, segmentDuration = 600) { // 10 minutes segments
    const duration = await this.getAudioDuration(audioPath);
    
    if (duration <= segmentDuration) {
      return [audioPath]; // No need to split
    }

    const segments = [];
    const segmentCount = Math.ceil(duration / segmentDuration);
    
    console.log(`Splitting ${duration}s audio into ${segmentCount} segments`);

    for (let i = 0; i < segmentCount; i++) {
      const segmentPath = await this.extractAudioSegment(audioPath, i, segmentDuration);
      segments.push(segmentPath);
    }

    return segments;
  }

  static async extractAudioSegment(audioPath, segmentIndex, segmentDuration) {
    return new Promise((resolve, reject) => {
      const segmentPath = audioPath.replace('.wav', `_segment_${segmentIndex}.wav`);
      const startTime = segmentIndex * segmentDuration;

      ffmpeg(audioPath)
        .output(segmentPath)
        .setStartTime(startTime)
        .duration(segmentDuration)
        .on('end', () => resolve(segmentPath))
        .on('error', reject)
        .run();
    });
  }

  static async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });
  }

  static async cleanupFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Cleaned up: ${filePath}`);
      }
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  }
}

export default AudioProcessor;