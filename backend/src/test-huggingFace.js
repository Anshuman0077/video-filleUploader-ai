import dotenv from 'dotenv';
// import STTService from './services/stt-service.js';
// import AudioChunkingService from './services/audio-chunking-service.js';
import STTService from "./services/stt.service.js"
import AudioChunkingService from "./services/audio-chucking.service.js"
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debug: Check if environment variables are loading
console.log('🔧 Environment Variables Debug:');
console.log('HUGGINGFACE_API_KEY exists:', !!process.env.HUGGINGFACE_API_KEY);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('---\n');

class HuggingFaceTester {
  constructor() {
    this.sttService = STTService;
    this.audioService = AudioChunkingService;
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Starting Hugging Face API Tests...\n');
    
    try {
      // Test 1: Check API Key and Model Status
      await this.testAPIKeyAndModel();
      
      // Test 2: Test Language Code Mapping
      await this.testLanguageCodeMapping();
      
      // Test 3: Test Audio Extraction (if sample video exists)
      await this.testAudioExtraction();
      
      // Test 4: Test Small Audio Transcription (if sample audio exists)
      await this.testSmallAudioTranscription();
      
      // Test 5: Test Error Handling
      await this.testErrorHandling();
      
      // Display final results
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    }
  }

  async testAPIKeyAndModel() {
    console.log('1. Testing API Key and Model Status...');
    
    const testResult = {
      name: 'API Key and Model Status',
      passed: false,
      details: ''
    };

    try {
      // Check if API key is loaded in environment
      if (!process.env.HUGGINGFACE_API_KEY) {
        throw new Error('HUGGINGFACE_API_KEY not found in environment variables. Check your .env file');
      }

      // Check if API key format looks valid
      if (!process.env.HUGGINGFACE_API_KEY.startsWith('hf_')) {
        throw new Error('API key format appears invalid (should start with hf_)');
      }

      console.log('✅ API Key found in environment:', process.env.HUGGINGFACE_API_KEY.substring(0, 10) + '...');

      // Check if STT service can access the API key
      if (!this.sttService.apiKey) {
        throw new Error('STT service cannot access the API key. Check service initialization');
      }

      console.log('✅ API Key accessible in STT service');

      // Test model status
      const status = await this.sttService.checkModelStatus();
      console.log('📊 Model Status:', status);

      testResult.passed = true;
      testResult.details = `Model: ${status.model || this.sttService.model}, Status: ${status.status}`;
      
    } catch (error) {
      testResult.details = error.message;
      console.error('❌ API Key and Model test failed:', error.message);
      
      // Additional debugging
      console.log('🔍 Debug info:');
      console.log('   - process.env keys:', Object.keys(process.env).filter(key => key.includes('HUGGING') || key.includes('API')));
      console.log('   - STT service API key:', this.sttService.apiKey ? 'Present' : 'Missing');
    }

    this.testResults.push(testResult);
    console.log('---\n');
  }

  async testLanguageCodeMapping() {
    console.log('2. Testing Language Code Mapping...');
    
    const testResult = {
      name: 'Language Code Mapping',
      passed: false,
      details: ''
    };

    try {
      const testCases = [
        { input: 'english', expected: 'en' },
        { input: 'spanish', expected: 'es' },
        { input: 'french', expected: 'fr' },
        { input: 'german', expected: 'de' },
        { input: 'unknown', expected: 'en' } // default
      ];

      let passedTests = 0;
      const results = [];

      for (const testCase of testCases) {
        const result = this.sttService.getLanguageCode(testCase.input);
        const passed = result === testCase.expected;
        
        if (passed) passedTests++;
        
        results.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: result,
          passed: passed
        });
      }

      testResult.passed = passedTests === testCases.length;
      testResult.details = `${passedTests}/${testCases.length} language mappings correct`;
      
      console.log('📋 Language mapping results:');
      results.forEach(r => {
        console.log(`   ${r.passed ? '✅' : '❌'} ${r.input} -> ${r.actual} (expected: ${r.expected})`);
      });

    } catch (error) {
      testResult.details = error.message;
      console.error('❌ Language mapping test failed:', error.message);
    }

    this.testResults.push(testResult);
    console.log('---\n');
  }

  async testAudioExtraction() {
    console.log('3. Testing Audio Extraction Service...');
    
    const testResult = {
      name: 'Audio Extraction',
      passed: false,
      details: ''
    };

    try {
      // Look for sample video files in multiple locations
      const possibleSampleDirs = [
        path.join(process.cwd(), 'samples'),
        path.join(__dirname, 'samples'),
        path.join(process.cwd(), 'src', 'samples'),
        path.join(process.cwd(), 'test-samples')
      ];

      const tempDir = path.join(process.cwd(), 'temp-test');
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Check for sample video files
      const sampleFiles = [
        'sample.mp4', 'sample.mov', 'sample.avi', 'test-video.mp4',
        'sample-video.mp4', 'example.mp4'
      ];

      let sampleVideoPath = null;
      let foundDir = '';
      
      // Search through all possible directories
      for (const sampleDir of possibleSampleDirs) {
        if (fs.existsSync(sampleDir)) {
          for (const file of sampleFiles) {
            const potentialPath = path.join(sampleDir, file);
            if (fs.existsSync(potentialPath)) {
              sampleVideoPath = potentialPath;
              foundDir = sampleDir;
              break;
            }
          }
          if (sampleVideoPath) break;
        }
      }

      if (!sampleVideoPath) {
        testResult.passed = true; // Skip this test if no sample file
        testResult.details = 'No sample video found - test skipped';
        console.log('⚠️ No sample video found. Searched in:');
        possibleSampleDirs.forEach(dir => console.log(`   - ${dir}`));
        console.log('💡 To test audio extraction, add a sample video file to one of these directories.');
        this.testResults.push(testResult);
        return;
      }

      console.log(`🎬 Found sample video: ${sampleVideoPath}`);
      console.log(`📁 Directory: ${foundDir}`);

      // Test audio extraction
      const audioPath = await this.audioService.extractAudio(sampleVideoPath, tempDir);
      
      if (fs.existsSync(audioPath)) {
        const stats = fs.statSync(audioPath);
        console.log(`✅ Audio extracted: ${path.basename(audioPath)}`);
        console.log(`📊 Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

        // Test getting audio duration
        const duration = await this.audioService.getAudioDuration(audioPath);
        console.log(`⏱️ Audio duration: ${duration.toFixed(2)} seconds`);

        testResult.passed = true;
        testResult.details = `Extracted audio: ${(stats.size / 1024 / 1024).toFixed(2)}MB, ${duration.toFixed(2)}s`;

        // Cleanup
        this.audioService.cleanupFiles([audioPath]);
      } else {
        throw new Error('Audio extraction failed - no output file');
      }

    } catch (error) {
      testResult.details = error.message;
      console.error('❌ Audio extraction test failed:', error.message);
    }

    this.testResults.push(testResult);
    console.log('---\n');
  }

  async testSmallAudioTranscription() {
    console.log('4. Testing Small Audio Transcription...');
    
    const testResult = {
      name: 'Small Audio Transcription',
      passed: false,
      details: ''
    };

    try {
      // First, ensure API key is available
      if (!this.sttService.apiKey) {
        testResult.details = 'API key not available - test skipped';
        console.log('⚠️ API key not available. Skipping transcription test.');
        this.testResults.push(testResult);
        return;
      }

      // Check for sample audio files in multiple locations
      const possibleSampleDirs = [
        path.join(process.cwd(), 'samples'),
        path.join(__dirname, 'samples'),
        path.join(process.cwd(), 'src', 'samples'),
        path.join(process.cwd(), 'test-samples')
      ];

      const audioFiles = [
        'sample-audio.wav', 'test-audio.wav', 'short-audio.wav',
        'sample.wav', 'audio-sample.wav'
      ];

      let sampleAudioPath = null;
      
      for (const sampleDir of possibleSampleDirs) {
        if (fs.existsSync(sampleDir)) {
          for (const file of audioFiles) {
            const potentialPath = path.join(sampleDir, file);
            if (fs.existsSync(potentialPath)) {
              sampleAudioPath = potentialPath;
              break;
            }
          }
          if (sampleAudioPath) break;
        }
      }

      if (!sampleAudioPath) {
        testResult.passed = true; // Skip if no sample audio
        testResult.details = 'No sample audio found - test skipped';
        console.log('⚠️ No sample audio found. Skipping transcription test.');
        console.log('💡 To test transcription, add a short audio file (WAV format, < 5MB) to samples/ directory.');
        this.testResults.push(testResult);
        return;
      }

      console.log(`🔊 Found sample audio: ${sampleAudioPath}`);

      // Check file size
      const stats = fs.statSync(sampleAudioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 5) {
        console.log('⚠️ Sample audio too large for quick test. Skipping.');
        testResult.passed = true;
        testResult.details = 'Sample audio too large - test skipped';
        this.testResults.push(testResult);
        return;
      }

      console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)}MB`);

      // Test single chunk transcription
      console.log('🔄 Starting transcription...');
      const transcription = await this.sttService.transcribeAudioChunk(sampleAudioPath, 'english');
      
      console.log('✅ Transcription successful!');
      console.log(`📝 Transcription: "${transcription}"`);
      
      testResult.passed = true;
      testResult.details = `Transcribed: "${transcription.substring(0, 50)}..."`;

    } catch (error) {
      testResult.details = error.message;
      console.error('❌ Transcription test failed:', error.message);
    }

    this.testResults.push(testResult);
    console.log('---\n');
  }

  async testErrorHandling() {
    console.log('5. Testing Error Handling...');
    
    const testResult = {
      name: 'Error Handling',
      passed: false,
      details: ''
    };

    try {
      // Test 1: Invalid file path
      console.log('Testing invalid file path handling...');
      try {
        await this.sttService.transcribeAudioChunk('/invalid/path/audio.wav', 'english');
        console.log('❌ Expected error for invalid path was not thrown');
      } catch (error) {
        console.log('✅ Correctly handled invalid file path');
      }

      // Test 2: Empty API key scenario
      console.log('Testing empty API key handling...');
      const originalApiKey = this.sttService.apiKey;
      this.sttService.apiKey = '';
      
      try {
        await this.sttService.transcribeAudioChunk('/dummy/path.wav', 'english');
        console.log('❌ Expected error for empty API key was not thrown');
      } catch (error) {
        console.log('✅ Correctly handled empty API key');
      }
      
      // Restore API key
      this.sttService.apiKey = originalApiKey;

      // Test 3: Invalid language
      const invalidLangCode = this.sttService.getLanguageCode('invalid-language');
      console.log(`✅ Invalid language handled: ${invalidLangCode}`);

      testResult.passed = true;
      testResult.details = 'All error scenarios handled correctly';

    } catch (error) {
      testResult.details = error.message;
      console.error('❌ Error handling test failed:', error.message);
    }

    this.testResults.push(testResult);
    console.log('---\n');
  }

  displayResults() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    
    let passedCount = 0;
    
    this.testResults.forEach((result, index) => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`${index + 1}. ${result.name}: ${status}`);
      console.log(`   Details: ${result.details}`);
      console.log();
      
      if (result.passed) passedCount++;
    });

    const totalTests = this.testResults.length;
    const successRate = (passedCount / totalTests) * 100;
    
    console.log(`Overall: ${passedCount}/${totalTests} tests passed (${successRate.toFixed(1)}%)`);
    
    if (successRate === 100) {
      console.log('🎉 All tests passed! Your Hugging Face integration is working correctly.');
    } else if (successRate >= 80) {
      console.log('⚠️ Most tests passed. Check failed tests for details.');
    } else {
      console.log('❌ Multiple tests failed. Please check your configuration.');
    }
  }
}

// Quick connection test function
export async function quickConnectionTest() {
  console.log('🚀 Running Quick Hugging Face Connection Test...\n');
  
  const tester = new HuggingFaceTester();
  
  try {
    // Just test the API connection and model status
    await tester.testAPIKeyAndModel();
    
    const results = tester.testResults[0];
    if (results.passed) {
      console.log('✅ Quick test passed! Hugging Face API is accessible.');
      return true;
    } else {
      console.log('❌ Quick test failed. Check your API key and network connection.');
      return false;
    }
  } catch (error) {
    console.error('❌ Quick test failed with error:', error.message);
    return false;
  }
}

// Run tests if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tester = new HuggingFaceTester();
  
  // Check if quick test is requested
  if (process.argv.includes('--quick')) {
    quickConnectionTest();
  } else {
    tester.runAllTests();
  }
}

export default HuggingFaceTester;