import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = 'AIzaSyBudp_O7MLk1qtKCMpO37Q45-6thPv_tAM';

async function testModels() {
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    
    console.log('🧪 Testing available models...');
    
    // Test gemini-2.0-flash
    try {
      console.log('Testing gemini-2.0-flash...');
      const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const resultFlash = await modelFlash.generateContent("Hello, are you working?");
      console.log('✅ gemini-2.0-flash:', resultFlash.response.text());
    } catch (error) {
      console.log('❌ gemini-2.0-flash failed:', error.message);
    }
    
    // Test gemini-pro
    try {
      console.log('Testing gemini-pro...');
      const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
      const resultPro = await modelPro.generateContent("Hello, are you working?");
      console.log('✅ gemini-pro:', resultPro.response.text());
    } catch (error) {
      console.log('❌ gemini-pro failed:', error.message);
    }
    
    // Test models/gemini-pro (full path)
    try {
      console.log('Testing models/gemini-pro...');
      const modelFull = genAI.getGenerativeModel({ model: "models/gemini-pro" });
      const resultFull = await modelFull.generateContent("Hello, are you working?");
      console.log('✅ models/gemini-pro:', resultFull.response.text());
    } catch (error) {
      console.log('❌ models/gemini-pro failed:', error.message);
    }
    
  } catch (error) {
    console.error('Global error:', error);
  }
}

testModels();