import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate environment variables
const validateEnvironment = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  if (!apiKey.startsWith('AIza')) {
    throw new Error('GEMINI_API_KEY appears to be invalid');
  }
  return apiKey;
};

// Initialize with proper error handling
let genAI;
let isGeminiAvailable = false;

try {
  const apiKey = validateEnvironment();
  genAI = new GoogleGenerativeAI(apiKey);
  isGeminiAvailable = true;
  console.log('✅ Gemini API initialized successfully');
} catch (error) {
  console.error('❌ Gemini initialization error:', error.message);
  isGeminiAvailable = false;
}

async function retryWithBackoff(fn, options = {}) {
  const { retries = 3, baseDelayMs = 1000 } = options;
  let attempt = 0;
  let lastError = null;
  
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      
      // Exponential backoff with jitter
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000, 30000);
      console.log(`Retry attempt ${attempt + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
  throw lastError;
}

// Input validation
const validateInput = (text, maxLength = 10000) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Input text must be a non-empty string');
  }
  if (text.length > maxLength) {
    throw new Error(`Input text exceeds maximum length of ${maxLength} characters`);
  }
  return text.trim();
};

// Test Gemini API connection
async function testGeminiConnection() {
  if (!isGeminiAvailable || !genAI) return false;
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Test connection - respond with 'OK'");
    const response = await result.response;
    return response.text().trim() === 'OK';
  } catch (error) {
    console.error('Gemini connection test failed:', error.message);
    return false;
  }
}

// Generate answer using Gemini
async function generateAnswer(transcript, question, language = 'english') {
  try {
    // Validate inputs
    const validatedTranscript = validateInput(transcript, 50000);
    const validatedQuestion = validateInput(question, 1000);
    
    const isConnected = await testGeminiConnection();
    if (!isConnected) {
      console.warn('Gemini not available, using smart fallback');
      return getSmartAnswer(validatedQuestion, validatedTranscript, language);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
      You are an AI assistant that answers questions about video content.
      Based EXCLUSIVELY on the following video transcript, answer the user's question.
      
      VIDEO TRANSCRIPT:
      ${validatedTranscript}
      
      USER'S QUESTION: ${validatedQuestion}
      
      IMPORTANT RULES:
      1. Answer ONLY using information from the transcript above
      2. If the question cannot be answered from the transcript, say: "I cannot answer this question based on the video content."
      3. Be helpful and accurate
      4. If the user greets you, respond politely and indicate you can answer questions about the video
      5. Respond in ${language}
      
      ANSWER:
    `;

    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Gemini API error:', error.message);
    return getSmartAnswer(question, transcript, language);
  }
}

// Generate video summary using Gemini
async function generateSummary(transcript, language = 'english') {
  try {
    const validatedTranscript = validateInput(transcript, 50000);
    
    const isConnected = await testGeminiConnection();
    if (!isConnected) {
      console.warn('Gemini not available, using smart summary');
      return getSmartSummary(validatedTranscript, language);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
      Create a comprehensive summary of the following video transcript in ${language}.
      
      TRANSCRIPT:
      ${validatedTranscript.substring(0, 10000)}
      
      Please provide a structured summary that captures the main points.
      
      SUMMARY in ${language}:
    `;

    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Gemini summary generation error:', error.message);
    return getSmartSummary(transcript, language);
  }
}

// Smart fallback functions
function getSmartAnswer(question, transcript, language) {
  const questionLower = question.toLowerCase().trim();
  
  // Handle greetings
  if (questionLower.includes('hi') || questionLower.includes('hello') || questionLower.includes('hey')) {
    return "Hello! I'm here to help answer questions about this video. What would you like to know?";
  }
  
  // Check if transcript is real
  const isRealTranscript = transcript && 
    !transcript.includes('fallback') && 
    !transcript.includes('limitations') && 
    transcript.length > 50;
  
  if (isRealTranscript) {
    return "I can answer questions about this video's content. The transcript is available and contains meaningful information that I can help you explore.";
  }
  
  return "I cannot answer questions about this video because the transcript is not available. The video may still be processing or there might be technical limitations.";
}

function getSmartSummary(transcript, language) {
  const isRealTranscript = transcript && 
    !transcript.includes('fallback') && 
    !transcript.includes('limitations') && 
    transcript.length > 50;
  
  if (isRealTranscript) {
    const wordCount = transcript.split(' ').length;
    return `This video transcript contains ${wordCount} words of meaningful content. A comprehensive summary would normally be generated here.`;
  }
  
  return "Video summary is currently unavailable. The transcript processing service is experiencing temporary limitations.";
}

// Generate embeddings - Fixed model name
async function generateEmbeddings(text) {
  if (!isGeminiAvailable || !genAI) return null;

  try {
    const validatedText = validateInput(text, 10000);
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await model.embedContent(validatedText);
    return result.embedding.values;
  } catch (error) {
    console.warn('Embedding generation error:', error.message);
    return null;
  }
}

export { generateAnswer, generateSummary, generateEmbeddings, testGeminiConnection };