import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Generate embeddings for text
async function generateEmbeddings(text) {
  try {
    // For now, we'll use a simple approach
    // In a real application, you would use a proper embedding model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;
    
    return embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw new Error('Failed to generate embeddings');
  }
}

module.exports = { generateEmbeddings };