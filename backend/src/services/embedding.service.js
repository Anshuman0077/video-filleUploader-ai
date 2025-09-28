import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Enhanced environment validation
const validateEnvironment = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required for embedding generation');
  }
  if (!apiKey.startsWith('AIza')) {
    throw new Error('GEMINI_API_KEY appears to be invalid');
  }
  return apiKey;
};

// Initialize with proper error handling
let genAI;
let isEmbeddingAvailable = false;

try {
  const apiKey = validateEnvironment();
  genAI = new GoogleGenerativeAI(apiKey);
  isEmbeddingAvailable = true;
  console.log('✅ Embedding service initialized successfully');
} catch (error) {
  console.error('❌ Embedding service initialization error:', error.message);
  isEmbeddingAvailable = false;
}

// Enhanced input validation
const validateInput = (text, maxLength = 10000) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Input text must be a non-empty string');
  }
  
  const trimmedText = text.trim();
  
  if (trimmedText.length === 0) {
    throw new Error('Input text cannot be empty or whitespace only');
  }
  
  if (trimmedText.length > maxLength) {
    throw new Error(`Input text exceeds maximum length of ${maxLength} characters`);
  }
  
  // Basic content validation
  if (trimmedText.length < 10) {
    console.warn('⚠️ Input text is very short, embedding quality may be low');
  }
  
  return trimmedText;
};

// Enhanced retry logic with exponential backoff
async function retryWithBackoff(fn, operationName = 'embedding generation', options = {}) {
  const { retries = 3, baseDelayMs = 1000 } = options;
  let attempt = 0;
  let lastError = null;
  
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (attempt === retries) {
        console.error(`❌ ${operationName} failed after ${retries} attempts:`, err.message);
        break;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000, 30000);
      console.warn(`🔄 ${operationName} attempt ${attempt + 1} failed, retrying in ${Math.round(delay / 1000)}s:`, err.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
  
  throw lastError;
}

// Generate embeddings for text with enhanced error handling
async function generateEmbeddings(text) {
  try {
    // Validate input
    const validatedText = validateInput(text, 10000);
    
    if (!isEmbeddingAvailable || !genAI) {
      console.warn('❌ Embedding service not available, returning null');
      return null;
    }

    // Use the correct embedding model
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    
    const result = await retryWithBackoff(
      () => model.embedContent(validatedText),
      'Embedding generation'
    );
    
    if (!result || !result.embedding || !result.embedding.values) {
      throw new Error('Invalid response from embedding service');
    }
    
    const embedding = result.embedding.values;
    
    // Validate embedding output
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding result is not an array');
    }
    
    if (embedding.length === 0) {
      throw new Error('Embedding result is empty');
    }
    
    // Check for valid numerical values
    const invalidValues = embedding.filter(value => 
      typeof value !== 'number' || !isFinite(value)
    );
    
    if (invalidValues.length > 0) {
      console.warn(`⚠️ Embedding contains ${invalidValues.length} invalid values`);
    }
    
    console.log(`✅ Embedding generated: ${embedding.length} dimensions`);
    return embedding;
    
  } catch (error) {
    console.error('❌ Embedding generation error:', {
      error: error.message,
      textLength: text?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    // Return null instead of throwing to allow graceful degradation
    return null;
  }
}

// Batch embedding generation
async function generateBatchEmbeddings(texts, options = {}) {
  try {
    if (!Array.isArray(texts)) {
      throw new Error('Texts must be an array');
    }
    
    if (texts.length === 0) {
      return [];
    }
    
    // Limit batch size for API constraints
    const maxBatchSize = options.maxBatchSize || 10;
    const batchSize = Math.min(texts.length, maxBatchSize);
    
    console.log(`🔄 Generating embeddings for ${texts.length} texts in batches of ${batchSize}`);
    
    const embeddings = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}`);
      
      const batchPromises = batch.map(text => 
        generateEmbeddings(text).catch(err => {
          console.warn(`⚠️ Failed to generate embedding for text ${i}:`, err.message);
          return null;
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults.filter(embedding => embedding !== null));
      
      // Rate limiting delay between batches
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Generated ${embeddings.length} embeddings out of ${texts.length} texts`);
    return embeddings;
    
  } catch (error) {
    console.error('❌ Batch embedding generation failed:', error);
    return [];
  }
}

// Health check function
async function healthCheck() {
  try {
    if (!isEmbeddingAvailable) {
      return {
        status: 'unhealthy',
        message: 'Embedding service not initialized',
        available: false
      };
    }
    
    // Test with a simple embedding
    const testText = 'This is a test for embedding service health check';
    const embedding = await generateEmbeddings(testText);
    
    return {
      status: 'healthy',
      message: 'Embedding service is operational',
      available: true,
      testEmbedding: embedding ? `${embedding.length} dimensions` : 'failed',
      model: 'embedding-001'
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      available: false,
      error: error.message
    };
  }
}

export { 
  generateEmbeddings, 
  generateBatchEmbeddings, 
  healthCheck,
  validateInput 
};