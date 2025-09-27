import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize with proper error handling
let genAI;
let isGeminiAvailable = false;

try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.startsWith('AIza')) {
    genAI = new GoogleGenerativeAI(apiKey);
    isGeminiAvailable = true;
    console.log('✅ Gemini API initialized successfully');
  } else {
    console.warn('❌ Gemini API key is missing or invalid format');
    isGeminiAvailable = false;
  }
} catch (error) {
  console.error('❌ Gemini initialization error:', error.message);
  isGeminiAvailable = false;
}

async function retryWithBackoff(fn, options = {}) {
  const { retries = 2, baseDelayMs = 1000 } = options;
  let attempt = 0;
  let lastError = null;
  
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
  throw lastError;
}

// Test Gemini API connection
async function testGeminiConnection() {
  if (!isGeminiAvailable || !genAI) return false;
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Test connection");
    await result.response;
    return true;
  } catch (error) {
    console.error('Gemini connection test failed:', error.message);
    return false;
  }
}

// Generate answer using Gemini
async function generateAnswer(transcript, question, language = 'english') {
  // Test connection first
  const isConnected = await testGeminiConnection();
  if (!isConnected) {
    console.warn('Gemini not available, using smart fallback');
    return getSmartAnswer(question, transcript, language);
  }

  try {
    // Use gemini-pro model which is more reliable
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = `
      You are an AI assistant that answers questions about video content.
      Based EXCLUSIVELY on the following video transcript, answer the user's question.
      
      VIDEO TRANSCRIPT:
      ${transcript}
      
      USER'S QUESTION: ${question}
      
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
  const isConnected = await testGeminiConnection();
  if (!isConnected) {
    console.warn('Gemini not available, using smart summary');
    return getSmartSummary(transcript, language);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = `
      Create a comprehensive summary of the following video transcript in ${language}.
      
      TRANSCRIPT:
      ${transcript}
      
      Please provide a clear, well-structured summary that captures the main points.
      
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
  const transcriptLower = transcript.toLowerCase();
  
  // Handle greetings
  if (questionLower.includes('hi') || questionLower.includes('hello') || questionLower.includes('hey')) {
    return "Hello! I'm here to help answer questions about this video. What would you like to know?";
  }
  
  // Check if transcript is real (not fallback)
  const isRealTranscript = transcript && 
    !transcript.includes('fallback') && 
    !transcript.includes('limitations') && 
    transcript.length > 50;
  
  if (isRealTranscript) {
    // Try to provide basic answers based on transcript content
    if (questionLower.includes('summary') || questionLower.includes('summarize') || questionLower.includes('overview')) {
      return `Based on the ${transcript.length}-character transcript, I can provide a summary. The video appears to contain substantial content that could be summarized.`;
    }
    
    if (questionLower.includes('what') || questionLower.includes('how') || questionLower.includes('explain')) {
      // Check if transcript contains relevant keywords
      const keywords = questionLower.split(' ').filter(word => word.length > 3);
      const hasRelevantContent = keywords.some(keyword => transcriptLower.includes(keyword));
      
      if (hasRelevantContent) {
        return `The transcript contains content related to your question. While detailed AI analysis is temporarily unavailable, the transcript does discuss topics relevant to "${question}".`;
      }
    }
    
    return "I can answer questions about this video's content. The transcript is available and contains meaningful information that I can help you explore.";
  }
  
  // If transcript is fallback
  return "I cannot answer questions about this video because the transcript is not available. The video may still be processing or there might be technical limitations.";
}

function getSmartSummary(transcript, language) {
  const isRealTranscript = transcript && 
    !transcript.includes('fallback') && 
    !transcript.includes('limitations') && 
    transcript.length > 50;
  
  if (isRealTranscript) {
    const wordCount = transcript.split(' ').length;
    const sentenceCount = (transcript.match(/[.!?]+/g) || []).length;
    
    return `This video transcript contains ${wordCount} words across ${sentenceCount} sentences. The content appears substantial and meaningful. A proper AI-generated summary would normally be available here.`;
  }
  
  return "Video summary is currently unavailable. The transcript processing service is experiencing temporary limitations.";
}

// Generate embeddings
async function generateEmbeddings(text) {
  if (!isGeminiAvailable || !genAI) return null;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.warn('Embedding generation error:', error.message);
    return null;
  }
}

export { generateAnswer, generateSummary, generateEmbeddings, testGeminiConnection };