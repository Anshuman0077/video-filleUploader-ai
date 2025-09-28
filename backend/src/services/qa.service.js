import { GoogleGenerativeAI } from '@google/generative-ai';
import { validateEnvVar } from '../config/env.js';

// Enhanced QA Service with RAG capabilities
class QAServiceWithRAG {
  constructor() {
    this.initializeService();
  }

  initializeService() {
    try {
      // Remove hardcoded API key - use environment variable
      const apiKey = validateEnvVar('GEMINI_API_KEY', 'string');
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" }); // Use gemini-pro for better quality
      this.isServiceAvailable = true;
      
      console.log('✅ QA Service with RAG initialized successfully');
    } catch (error) {
      console.error('❌ QA Service initialization failed:', error.message);
      this.genAI = null;
      this.model = null;
      this.isServiceAvailable = false;
    }
  }

  // Enhanced input validation
  validateInputs(question, language, videoId = null) {
    const errors = [];
    
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      errors.push('Question must be a non-empty string');
    }
    
    if (question.length > 1000) {
      errors.push('Question exceeds maximum length of 1000 characters');
    }
    
    // Security validation - prevent injection attacks
    const maliciousPattern = /[<>$`|&;{}()[\]]/;
    if (maliciousPattern.test(question)) {
      errors.push('Question contains potentially dangerous characters');
    }
    
    const supportedLanguages = ['english', 'spanish', 'french', 'german', 'hindi', 'chinese'];
    if (language && !supportedLanguages.includes(language.toLowerCase())) {
      errors.push(`Unsupported language: ${language}. Supported: ${supportedLanguages.join(', ')}`);
    }
    
    if (videoId && (typeof videoId !== 'string' || videoId.length < 10)) {
      errors.push('Invalid video ID format');
    }
    
    if (errors.length > 0) {
      throw new Error(`Input validation failed: ${errors.join(', ')}`);
    }
    
    return {
      question: question.trim(),
      language: language?.toLowerCase() || 'english',
      videoId: videoId
    };
  }

  // Enhanced retry logic
  async retryWithBackoff(operation, operationName, maxRetries = 3) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt > maxRetries) break;
        
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.warn(`🔄 ${operationName} attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async answerQuestionWithRAG(videoId, question, language = 'english') {
    const startTime = Date.now();
    
    try {
      // Enhanced input validation
      const { question: validatedQuestion, language: validatedLanguage } = 
        this.validateInputs(question, language, videoId);
      
      if (!this.isServiceAvailable || !this.model) {
        console.warn('❌ QA service not available, using enhanced fallback');
        return await this.enhancedFallbackAnswer(validatedQuestion, validatedLanguage, videoId);
      }

      // Use RAG-enhanced answer with timeout
      const result = await Promise.race([
        this.ragEnhancedAnswer(videoId, validatedQuestion, validatedLanguage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('QA service timeout')), 30000)
        )
      ]);
      
      const processingTime = Date.now() - startTime;
      
      return {
        ...result,
        processingTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ RAG QA error:', {
        error: error.message,
        videoId,
        questionLength: question?.length,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      return await this.enhancedFallbackAnswer(question, language, videoId);
    }
  }

  async ragEnhancedAnswer(videoId, question, language = 'english') {
    // In a real implementation, this would integrate with your vector database
    // For now, we'll use an enhanced direct answer that's aware of video context
    
    const prompt = `
      You are an AI assistant specialized in answering questions about video content.
      
      CONTEXT: You are answering questions about a specific video that the user has uploaded.
      VIDEO ID: ${videoId}
      USER'S QUESTION: ${question}
      
      IMPORTANT RULES:
      1. Be helpful, accurate, and concise
      2. If the user greets you, respond politely and indicate you can answer questions about their video
      3. Respond in ${language}
      4. If the question is about video content, mention you're analyzing their specific video
      5. If you cannot answer based on video context, provide general helpful information
      6. Keep responses under 300 words
      7. If the video is still processing, be patient and suggest waiting
      
      ANSWER:
    `;

    const result = await this.retryWithBackoff(
      () => this.model.generateContent(prompt),
      'Gemini content generation'
    );
    
    const response = await result.response;
    const answer = response.text().trim();

    return {
      answer: answer,
      relevantChunks: await this.calculateRelevance(question, answer),
      confidence: this.calculateConfidence(answer, question, language),
      sources: await this.getSimulatedSources(videoId),
      model: 'gemini-pro'
    };
  }

  async directAnswer(question, language = 'english') {
    try {
      const prompt = `
        You are an AI assistant that answers questions helpfully and accurately.
        
        USER'S QUESTION: ${question}
        
        IMPORTANT RULES:
        1. Be helpful, accurate, and concise
        2. If the user greets you, respond politely
        3. Respond in ${language}
        4. If you cannot answer based on context, provide general helpful information
        5. Keep responses under 500 words
        
        ANSWER:
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text().trim();

      return {
        answer: answer,
        relevantChunks: 1,
        confidence: this.calculateConfidence(answer, question),
        sources: [],
        model: 'gemini-pro'
      };
    } catch (error) {
      console.error('❌ Direct answer failed:', error.message);
      throw new Error(`Direct answer failed: ${error.message}`);
    }
  }

  async enhancedFallbackAnswer(question, language = 'english', videoId = null) {
    const questionLower = question.toLowerCase().trim();
    
    // Comprehensive fallback responses
    const simpleAnswers = {
      'hi': 'Hello! I\'m here to help you with questions about your videos. What would you like to know about your video content?',
      'hello': 'Hi there! I can help answer questions about your video content. What are you curious about?',
      'hey': 'Hey! I\'m ready to help with your video questions. What do you want to know?',
      'thank you': 'You\'re welcome! Is there anything else you\'d like to know about your videos?',
      'thanks': 'My pleasure! Feel free to ask more questions about your video content.',
      'how are you': 'I\'m doing well, thank you! Ready to help you with your video questions. What can I assist with?',
      'what can you do': 'I can answer questions about your uploaded videos, provide summaries, and help you understand the content. Try asking about a specific video!'
    };
    
    // Video-specific responses
    const videoAnswers = {
      'transcript': 'I can help you understand the transcript of your video. Please make sure your video processing is complete and try asking a specific question about the content.',
      'summary': 'I can generate summaries of your video content. Once your video is processed, I\'ll be able to provide a comprehensive summary.',
      'what is this video about': 'I\'d love to tell you about your video! Please make sure the video processing is complete, then I can provide a detailed analysis.'
    };
    
    // Check for exact matches first
    if (simpleAnswers[questionLower]) {
      return {
        answer: simpleAnswers[questionLower],
        relevantChunks: 0,
        confidence: 95,
        sources: [],
        isFallback: true
      };
    }
    
    // Check for video-specific questions
    for (const [key, response] of Object.entries(videoAnswers)) {
      if (questionLower.includes(key)) {
        return {
          answer: response,
          relevantChunks: 0,
          confidence: 90,
          sources: [],
          isFallback: true
        };
      }
    }
    
    // Check for partial matches in simple answers
    for (const [key, response] of Object.entries(simpleAnswers)) {
      if (questionLower.includes(key)) {
        return {
          answer: response,
          relevantChunks: 0,
          confidence: 85,
          sources: [],
          isFallback: true
        };
      }
    }
    
    // Context-aware fallback based on videoId presence
    let baseResponse = `I'd be happy to help with your question about "${question}".`;
    
    if (videoId) {
      baseResponse += ` Currently, I'm optimized for answering questions about video content. Please make sure your video has been processed and has a transcript available.`;
    } else {
      baseResponse += ` I specialize in video content analysis. If you have a video uploaded, I can help answer questions about its content.`;
    }

    return {
      answer: baseResponse,
      relevantChunks: 0,
      confidence: 75,
      sources: [],
      isFallback: true
    };
  }

  calculateConfidence(answer, question, language = 'english') {
    let confidence = 50; // Base confidence
    
    // Increase confidence for longer, substantive answers
    if (answer.length > 100) confidence += 20;
    if (answer.length > 200) confidence += 10;
    
    // Decrease confidence for short or generic answers
    if (answer.length < 50) confidence -= 15;
    
    // Increase confidence if answer directly addresses question keywords
    const questionWords = question.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const answerLower = answer.toLowerCase();
    const matchingWords = questionWords.filter(word => answerLower.includes(word));
    
    confidence += matchingWords.length * 5;
    
    // Language-specific confidence adjustments
    if (language !== 'english') {
      confidence -= 10; // Slightly lower confidence for non-English
    }
    
    // Cap confidence between 0 and 100
    return Math.max(0, Math.min(100, Math.round(confidence)));
  }

  async calculateRelevance(question, answer) {
    // Simulate relevance calculation based on answer quality
    let relevance = 1; // Base relevance
    
    // Simple heuristic: longer answers that contain question words are more relevant
    const questionWords = question.split(/\s+/).filter(word => word.length > 3);
    const answerWords = answer.split(/\s+/);
    
    const matchingWords = questionWords.filter(qWord => 
      answerWords.some(aWord => aWord.toLowerCase().includes(qWord.toLowerCase()))
    );
    
    relevance += matchingWords.length;
    relevance += Math.min(answerWords.length / 100, 5); // Cap length bonus
    
    return Math.max(1, Math.round(relevance));
  }

  async getSimulatedSources(videoId) {
    if (!videoId) return [];
    
    // Simulate source retrieval - in real implementation, this would query your vector DB
    return [
      {
        id: 'simulated_source_1',
        content: 'Video transcript segment related to the question',
        timestamp: '00:01:30',
        confidence: 0.85
      }
    ];
  }

  // Health check method
  async healthCheck() {
    try {
      if (!this.isServiceAvailable) {
        return {
          status: 'unhealthy',
          message: 'QA service not initialized',
          available: false,
          timestamp: new Date().toISOString()
        };
      }
      
      // Test with a simple question
      const testResult = await this.directAnswer('Hello', 'english');
      
      return {
        status: 'healthy',
        message: 'QA service is operational',
        available: true,
        model: 'gemini-pro',
        test: {
          question: 'Hello',
          answerLength: testResult.answer.length,
          confidence: testResult.confidence,
          responseTime: 'measured'
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        available: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Method to check service availability
  isAvailable() {
    return this.isServiceAvailable;
  }

  // Method to reload service (e.g., if API key changes)
  reloadService() {
    console.log('🔄 Reloading QA service...');
    this.initializeService();
  }
}

export default new QAServiceWithRAG();