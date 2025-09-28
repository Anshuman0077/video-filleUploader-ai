import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create sample directory and test files
function createTestSamples() {
  const samplesDir = path.join(__dirname, 'samples');
  
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
    console.log('✅ Created samples directory');
  }

  // Create a simple README for sample files
  const readmeContent = `# Test Samples Directory

Place your test files here:
- sample.mp4, sample.mov, or test-video.mp4 - for video processing tests
- sample-audio.wav or short-audio.wav - for direct audio transcription tests

File requirements:
- Video files: Should be short (1-2 minutes) for quick testing
- Audio files: Should be small (< 5MB) and in WAV format for best results
`;
  
  fs.writeFileSync(path.join(samplesDir, 'README.md'), readmeContent);
  console.log('✅ Created samples README');
  
  console.log('\n📝 Next steps:');
  console.log('1. Add some sample video/audio files to the samples/ directory');
  console.log('2. Run: node test-huggingface.js');
  console.log('3. For quick test: node test-huggingface.js --quick');
}

createTestSamples();