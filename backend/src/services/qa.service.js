import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class QAServiceWithRAG {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }

  async answerQuestionWithRAG(videoId, question, language = 'english') {
    try {
      // For now, use direct Gemini until RAG is fully implemented
      return await this.directAnswer(question, language);
    } catch (error) {
      console.error('RAG QA error:', error);
      return await this.fallbackAnswer(question, language);
    }
  }

  async directAnswer(question, language = 'english') {
    try {
      const prompt = `
        You are an AI assistant that answers questions helpfully and accurately.
        
        USER'S QUESTION: ${question}
        
        IMPORTANT RULES:
        1. Be helpful and accurate
        2. If the user greets you, respond politely
        3. Respond in ${language}
        4. If you cannot answer based on context, provide general helpful information
        
        ANSWER:
      `;

      const result = await this.model.generateContent(prompt);
      const answer = await result.response.text();

      return {
        answer: answer.trim(),
        relevantChunks: 0,
        confidence: 85,
        sources: []
      };
    } catch (error) {
      throw new Error(`Direct answer failed: ${error.message}`);
    }
  }

  async fallbackAnswer(question, language = 'english') {
    const simpleAnswers = {
      'hi': 'Hello! How can I help you today?',
      'hello': 'Hi there! What would you like to know?',
      'hey': 'Hey! How can I assist you?'
    };

    const questionLower = question.toLowerCase().trim();
    
    if (simpleAnswers[questionLower]) {
      return {
        answer: simpleAnswers[questionLower],
        relevantChunks: 0,
        confidence: 90,
        sources: []
      };
    }

    return {
      answer: `I'd be happy to help with your question about "${question}". Currently, I'm optimized for answering questions about video content.`,
      relevantChunks: 0,
      confidence: 75,
      sources: []
    };
  }

  calculateConfidence(distances) {
    if (!distances || distances.length === 0) return 0;
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    return Math.max(0, 100 - (avgDistance * 100));
  }
}

export default new QAServiceWithRAG();