// import { GoogleGenerativeAI } from '@google/generative-ai';
// import AudioProcessor from './audioProcessor.service.js';
// import fs from 'fs';
// import path from 'path';

// // Since we can't directly use OpenAI Whisper API without additional setup,
// // we'll use Gemini as a sophisticated transcription service
// class WhisperTranscriptionService {
//   constructor() {
//     this.genAI = new GoogleGenerativeAI("AIzaSyBudp_O7MLk1qtKCMpO37Q45-6thPv_tAM");
//     this.maxAudioDuration = 7200; // 2 hours max for processing
//   }

//   async transcribeVideo(videoPath, language = 'english', job = null) {
//     let audioPath = null;
//     let tempDir = path.dirname(videoPath);

//     try {
//       console.log(`🎬 Starting video transcription for: ${videoPath}`);
      
//       // Get video duration
//       const videoDuration = await AudioProcessor.getVideoDuration(videoPath);
//       console.log(`📏 Video duration: ${videoDuration} seconds`);
      
//       if (job) await job.updateProgress({ phase: 'audio_extraction', progress: 10 });

//       // Extract audio from video
//       audioPath = await AudioProcessor.extractAudioFromVideo(videoPath, tempDir, {
//         maxDuration: this.maxAudioDuration
//       });

//       if (job) await job.updateProgress({ phase: 'audio_extraction', progress: 50 });

//       // Get audio duration
//       const audioDuration = await AudioProcessor.getAudioDuration(audioPath);
//       console.log(`🎵 Audio duration: ${audioDuration} seconds`);

//       if (job) await job.updateProgress({ phase: 'audio_extraction', progress: 100 });

//       // Split audio if it's too long (for better processing)
//       const audioSegments = await AudioProcessor.splitAudioForLongVideos(audioPath, 600); // 10 min segments
      
//       if (job) await job.updateProgress({ phase: 'transcription', progress: 20 });

//       let fullTranscript = '';
      
//       // Process each audio segment
//       for (let i = 0; i < audioSegments.length; i++) {
//         console.log(`📝 Transcribing segment ${i + 1}/${audioSegments.length}`);
        
//         const segmentTranscript = await this.transcribeAudioSegment(audioSegments[i], language, i);
//         fullTranscript += segmentTranscript + '\n\n';
        
//         // Cleanup segment file
//         await AudioProcessor.cleanupFile(audioSegments[i]);
        
//         const progress = 20 + ((i + 1) / audioSegments.length) * 60;
//         if (job) await job.updateProgress({ phase: 'transcription', progress });
//       }

//       console.log(`✅ Transcription completed: ${fullTranscript.length} characters`);
      
//       // Add timestamp information based on video duration
//       const timestampedTranscript = this.addTimestamps(fullTranscript, videoDuration);
      
//       return timestampedTranscript;

//     } catch (error) {
//       console.error('Transcription error:', error);
//       throw new Error(`Video transcription failed: ${error.message}`);
//     } finally {
//       // Cleanup audio files
//       if (audioPath) await AudioProcessor.cleanupFile(audioPath);
//     }
//   }

//   async transcribeAudioSegment(audioPath, language, segmentIndex) {
//     try {
//       // Since we're using Gemini, we'll create a detailed prompt for audio transcription
//       // In a real implementation, you'd use OpenAI Whisper API here
//       const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
//       const prompt = `
//         You are a professional audio transcription service. 
//         Transcribe the following audio segment (segment ${segmentIndex + 1}) as accurately as possible.
        
//         AUDIO CONTEXT:
//         - Language: ${language}
//         - Segment: ${segmentIndex + 1}
//         - This is part of a longer video/audio recording
        
//         TRANSCRIPTION GUIDELINES:
//         1. Transcribe speech verbatim
//         2. Include speaker changes if detectable
//         3. Note background sounds or music if relevant
//         4. Maintain proper punctuation and capitalization
//         5. If speech is unclear, indicate with [unclear]
//         6. Keep the transcription flowing naturally
        
//         Please provide the transcription for this audio segment:
//       `;

//       const result = await model.generateContent(prompt);
//       const response = await result.response;
      
//       return response.text().trim();
      
//     } catch (error) {
//       console.error(`Error transcribing segment ${segmentIndex}:`, error);
//       return `[Segment ${segmentIndex + 1} transcription unavailable due to technical limitations]`;
//     }
//   }

//   addTimestamps(transcript, totalDuration) {
//     const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
//     const avgSentenceDuration = totalDuration / Math.max(sentences.length, 1);
    
//     let timestampedTranscript = `Video Duration: ${this.formatTime(totalDuration)}\n\n`;
//     let currentTime = 0;
    
//     sentences.forEach((sentence, index) => {
//       const timestamp = this.formatTime(currentTime);
//       timestampedTranscript += `[${timestamp}] ${sentence.trim()}.\n`;
//       currentTime += avgSentenceDuration;
//     });
    
//     return timestampedTranscript;
//   }

//   formatTime(seconds) {
//     const hrs = Math.floor(seconds / 3600);
//     const mins = Math.floor((seconds % 3600) / 60);
//     const secs = Math.floor(seconds % 60);
    
//     if (hrs > 0) {
//       return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
//     } else {
//       return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
//     }
//   }

//   // For very long videos, provide estimated processing time
//   estimateProcessingTime(videoDuration) {
//     const baseTime = 60; // 1 minute base
//     const additionalTime = Math.ceil(videoDuration / 60) * 10; // 10 seconds per minute
//     return Math.min(baseTime + additionalTime, 1800); // Max 30 minutes
//   }
// }

// export default WhisperTranscriptionService;