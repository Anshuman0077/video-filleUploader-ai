import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

class AudioConverter {
  static async convertVideoToAudio(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
      const outputFileName = `audio_${Date.now()}.wav`;
      const outputPath = path.join(outputDir, outputFileName);

      ffmpeg(videoPath)
        .output(outputPath)
        .audioCodec('pcm_s16le') // WAV format preferred by speech recognition
        .audioFrequency(16000)   // Standard for speech recognition
        .audioChannels(1)        // Mono audio
        .on('end', () => {
          console.log(`✅ Audio conversion completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ Audio conversion error:', err);
          reject(new Error(`Audio conversion failed: ${err.message}`));
        })
        .on('progress', (progress) => {
          console.log(`📊 Conversion progress: ${progress.percent}%`);
        })
        .run();
    });
  }

  static async extractAudioFromVideo(videoPath, outputDir) {
    try {
      // Check if video file exists
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      return await this.convertVideoToAudio(videoPath, outputDir);
    } catch (error) {
      console.error('Audio extraction error:', error);
      throw error;
    }
  }

  static async cleanupAudioFile(audioPath) {
    try {
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🧹 Cleaned up audio file: ${audioPath}`);
      }
    } catch (error) {
      console.warn('Warning: Could not cleanup audio file:', error.message);
    }
  }
}

export default AudioConverter;