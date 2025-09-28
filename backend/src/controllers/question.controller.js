import Video from "../models/videos.model.js";
// import Question from "../models/questions.model.js";
import Question from "../models/questions.models.js"
import { generateSummary } from '../services/gemini.service.js';
import QAServiceWithRAG from '../services/qa.service.js';
import mongoose from 'mongoose';

// Enhanced input validation
const validateQuestionInput = (question, videoId, language) => {
  const errors = [];
  
  if (!question || question.trim().length === 0) {
    errors.push('Question is required');
  }
  
  if (question && question.length > 1000) {
    errors.push('Question must be less than 1000 characters');
  }
  
  if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
    errors.push('Valid video ID is required');
  }
  
  if (language && !['english', 'spanish', 'french', 'german', 'hindi', 'chinese'].includes(language.toLowerCase())) {
    errors.push('Unsupported language');
  }
  
  // Security: check for potential injection attacks
  const maliciousPattern = /[<>$`|&;{}()[\]]/;
  if (maliciousPattern.test(question)) {
    errors.push('Question contains invalid characters');
  }
  
  return errors;
};

// Ask a question about a video with enhanced error handling
const askQuestion = async (req, res) => {
  try {
    const { videoId, question, language = 'english' } = req.body;
    
    // Enhanced input validation
    const validationErrors = validateQuestionInput(question, videoId, language);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors,
        code: 'VALIDATION_ERROR'
      });
    }

    // Find the video with enhanced error handling
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ 
        message: 'Video not found', 
        code: 'VIDEO_NOT_FOUND'
      });
    }
    
    // Check if user owns the video
    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied to this video', 
        code: 'ACCESS_DENIED'
      });
    }
    
    // Check if video processing is complete
    if (video.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Video is still processing', 
        code: 'VIDEO_PROCESSING'
      });
    }
    
    if (!video.transcript) {
      return res.status(400).json({ 
        message: 'Video transcript not available', 
        code: 'TRANSCRIPT_UNAVAILABLE'
      });
    }
    
    const startTime = Date.now();
    
    // Use RAG to answer the question with timeout
    const ragResult = await Promise.race([
      QAServiceWithRAG.answerQuestionWithRAG(videoId, question, language),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Question answering timeout')), 30000)
      )
    ]);
    
    const processingTime = Date.now() - startTime;
    
    // Save the question and answer
    const qa = new Question({
      question: question.trim(),
      answer: ragResult.answer,
      videoId,
      userId: req.user.id,
      language: language.toLowerCase(),
      confidence: ragResult.confidence || 0,
      relevantChunks: ragResult.relevantChunks || 0,
      processingTime
    });
    
    await qa.save();
    
    res.json({ 
      message: 'Question answered successfully', 
      data: { 
        id: qa._id,
        question: qa.question, 
        answer: qa.answer,
        confidence: ragResult.confidence,
        relevantSources: ragResult.relevantChunks,
        processingTime: qa.processingTime,
        askedAt: qa.askedAt,
        videoId: qa.videoId
      } 
    });
  } catch (error) {
    console.error('Ask question error:', {
      error: error.message,
      videoId: req.body.videoId,
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });
    
    // Handle specific error types
    if (error.message.includes('timeout')) {
      return res.status(408).json({ 
        message: 'Question answering timeout. Please try again.',
        code: 'TIMEOUT_ERROR'
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to answer question', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUESTION_ERROR'
    });
  }
};

// Get question history for a video with enhanced security
const getVideoQuestions = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Enhanced validation
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ 
        message: 'Invalid video ID format',
        code: 'INVALID_VIDEO_ID'
      });
    }
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    
    // Verify user has access to the video
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ 
        message: 'Video not found',
        code: 'VIDEO_NOT_FOUND'
      });
    }
    
    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied to this video',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Get questions with pagination
    const questions = await Question.findByVideo(videoId, {
      page: pageNum,
      limit: limitNum
    });
    
    const total = await Question.countDocuments({ videoId });
    
    res.json({ 
      message: 'Questions retrieved successfully', 
      data: {
        questions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Get questions error:', {
      error: error.message,
      videoId: req.params.videoId,
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      message: 'Failed to retrieve questions', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'FETCH_QUESTIONS_ERROR'
    });
  }
};

// Generate video summary with enhanced validation
const generateVideoSummary = async (req, res) => {
  try {
    const { videoId, language = 'english' } = req.body;
    
    // Enhanced validation
    if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ 
        message: 'Valid video ID is required',
        code: 'INVALID_VIDEO_ID'
      });
    }
    
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ 
        message: 'Video not found',
        code: 'VIDEO_NOT_FOUND'
      });
    }
    
    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied to this video',
        code: 'ACCESS_DENIED'
      });
    }
    
    if (video.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Video is still processing',
        code: 'VIDEO_PROCESSING'
      });
    }
    
    if (!video.transcript) {
      return res.status(400).json({ 
        message: 'Video transcript not available',
        code: 'TRANSCRIPT_UNAVAILABLE'
      });
    }
    
    // Generate summary with timeout
    const summary = await Promise.race([
      generateSummary(video.transcript, language),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Summary generation timeout')), 45000)
      )
    ]);
    
    // Update video with summary
    video.summary = summary;
    await video.save();
    
    res.json({
      message: 'Summary generated successfully',
      data: {
        summary,
        videoId: video._id,
        language,
        length: summary.length,
        wordCount: summary.split(/\s+/).length
      }
    });
  } catch (error) {
    console.error('Generate summary error:', {
      error: error.message,
      videoId: req.body.videoId,
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });
    
    if (error.message.includes('timeout')) {
      return res.status(408).json({ 
        message: 'Summary generation timeout. Please try again.',
        code: 'TIMEOUT_ERROR'
      });
    }
    
    res.status(500).json({
      message: 'Failed to generate summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'SUMMARY_ERROR'
    });
  }
};

export { askQuestion, getVideoQuestions, generateVideoSummary };