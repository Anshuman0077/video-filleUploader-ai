import mongoose from 'mongoose';
// import Video from "../models/videos.model.js";
import Video from "../models/videos.model.js"
// import Question from "../models/questions.model.js";
import Question from "../models/questions.models.js"
// import { generateSummary } from '../services/gemini.service.js';
import { generateSummary } from '../services/gemini.service.js';
// import QAServiceWithRAG from '../services/qa.service.js'; // Fixed import
import QAServiceWithRAG from '../services/qa.service.js';

// Ask a question about a video
const askQuestion = async (req, res) => {
  try {
    const { videoId, question, language = 'english' } = req.body;
    
    if (!question || question.trim().length === 0) {
      return res.status(400).json({ message: 'Question is required' });
    }

    if (question.length > 1000) {
      return res.status(400).json({ message: 'Question must be less than 1000 characters' });
    }
    
    // Find the video
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Check if user owns the video
    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check if video processing is complete
    if (video.status !== 'completed') {
      return res.status(400).json({ message: 'Video is still processing' });
    }
    
    if (!video.transcript) {
      return res.status(400).json({ message: 'Video transcript not available' });
    }
    
    // Use RAG to answer the question
    const ragResult = await QAServiceWithRAG.answerQuestionWithRAG(videoId, question, language);
    
    // Save the question and answer
    const qa = new Question({
      question: question.trim(),
      answer: ragResult.answer,
      videoId,
      userId: req.user.id,
      language
    });
    
    await qa.save();
    
    res.json({ 
      message: 'Question answered successfully', 
      data: { 
        question: qa.question, 
        answer: qa.answer,
        confidence: ragResult.confidence,
        relevantSources: ragResult.relevantChunks,
        askedAt: qa.askedAt
      } 
    });
  } catch (error) {
    console.error('Ask question error:', error);
    res.status(500).json({ 
      message: 'Failed to answer question', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get question history for a video
const getVideoQuestions = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ message: 'Invalid video ID' });
    }
    
    // Verify user has access to the video
    const video = await Video.findById(videoId);
    if (!video || video.userId.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    const questions = await Question.find({ videoId })
      .select('-__v')
      .sort({ askedAt: -1 })
      .lean();
      
    res.json({ 
      message: 'Questions retrieved successfully', 
      data: questions 
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Generate video summary
const generateVideoSummary = async (req, res) => {
  try {
    const { videoId, language = 'english' } = req.body;
    
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    if (video.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    if (video.status !== 'completed') {
      return res.status(400).json({ message: 'Video is still processing' });
    }
    
    if (!video.transcript) {
      return res.status(400).json({ message: 'Video transcript not available' });
    }
    
    // Generate summary using Gemini
    const summary = await generateSummary(video.transcript, language);
    
    // Update video with summary
    video.summary = summary;
    await video.save();
    
    res.json({
      message: 'Summary generated successfully',
      data: {
        summary,
        videoId: video._id
      }
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    res.status(500).json({
      message: 'Failed to generate summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export { askQuestion, getVideoQuestions, generateVideoSummary };