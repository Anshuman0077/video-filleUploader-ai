import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Define required and optional environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'REDIS_HOST',
  'REDIS_PORT'
];

// Set default values for worker and processing configuration
const setDefaults = () => {
  // Worker configuration defaults
  if (!process.env.WORKER_CONCURRENCY) {
    process.env.WORKER_CONCURRENCY = '1';
  }
  if (!process.env.WORKER_LOCK_DURATION) {
    process.env.WORKER_LOCK_DURATION = '1800000'; // 30 minutes
  }
  if (!process.env.WORKER_STALLED_INTERVAL) {
    process.env.WORKER_STALLED_INTERVAL = '600000'; // 10 minutes
  }
  if (!process.env.WORKER_GRACE_TIMEOUT_MS) {
    process.env.WORKER_GRACE_TIMEOUT_MS = '300000'; // 5 minutes
  }
  
  // Download configuration defaults
  if (!process.env.DOWNLOAD_TOTAL_TIMEOUT_MS) {
    process.env.DOWNLOAD_TOTAL_TIMEOUT_MS = '1200000'; // 20 minutes
  }
  if (!process.env.DOWNLOAD_INACTIVITY_TIMEOUT_MS) {
    process.env.DOWNLOAD_INACTIVITY_TIMEOUT_MS = '120000'; // 2 minutes
  }
  
  // // OpenAI configuration defaults
  // if (!process.env.OPENAI_TIMEOUT_MS) {
  //   process.env.OPENAI_TIMEOUT_MS = '180000'; // 3 minutes
  // }
  // if (!process.env.WHISPER_MAX_RETRIES) {
  //   process.env.WHISPER_MAX_RETRIES = '5';
  // }
  
  // Job configuration defaults
  if (!process.env.JOB_MAX_ATTEMPTS) {
    process.env.JOB_MAX_ATTEMPTS = '5';
  }
  if (!process.env.JOB_TIMEOUT_MS) {
    process.env.JOB_TIMEOUT_MS = '1800000'; // 30 minutes
  }
};

// Validate numeric environment variables
const validateNumericVars = () => {
  const numericVars = [
    'WORKER_CONCURRENCY',
    'WORKER_LOCK_DURATION', 
    'WORKER_STALLED_INTERVAL',
    'WORKER_GRACE_TIMEOUT_MS',
    'DOWNLOAD_TOTAL_TIMEOUT_MS',
    'DOWNLOAD_INACTIVITY_TIMEOUT_MS',
    'JOB_MAX_ATTEMPTS',
    'JOB_TIMEOUT_MS'
  ];
  
  for (const varName of numericVars) {
    const value = process.env[varName];
    if (value && isNaN(Number(value))) {
      console.error(`❌ Invalid value for ${varName}: ${value}. Must be a number.`);
      process.exit(1);
    }
  }
};

const missingRequiredVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingRequiredVars.length > 0) {
  console.error('❌ Missing critical required environment variables:', missingRequiredVars.join(', '));
  console.error('👉 Please ensure you have a .env file with all required variables defined.');
  process.exit(1);
}

// Apply defaults and validate
setDefaults();
validateNumericVars();

console.log('✅ Environment variables loaded and validated.');
console.log('📋 Worker Configuration:');
console.log(`   - Concurrency: ${process.env.WORKER_CONCURRENCY}`);
console.log(`   - Lock Duration: ${Number(process.env.WORKER_LOCK_DURATION) / 1000}s`);
console.log(`   - Stalled Interval: ${Number(process.env.WORKER_STALLED_INTERVAL) / 1000}s`);
console.log(`   - Grace Timeout: ${Number(process.env.WORKER_GRACE_TIMEOUT_MS) / 1000}s`);
console.log('📋 Download Configuration:');
console.log(`   - Total Timeout: ${Number(process.env.DOWNLOAD_TOTAL_TIMEOUT_MS) / 1000}s`);
console.log(`   - Inactivity Timeout: ${Number(process.env.DOWNLOAD_INACTIVITY_TIMEOUT_MS) / 1000}s`);
console.log(`   - API Timeout: ${Number(process.env.OPENAI_TIMEOUT_MS) / 1000}s`);
console.log(`   - Max Retries: ${process.env.WHISPER_MAX_RETRIES}`);
console.log('📋 Job Configuration:');
console.log(`   - Max Attempts: ${process.env.JOB_MAX_ATTEMPTS}`);
console.log(`   - Job Timeout: ${Number(process.env.JOB_TIMEOUT_MS) / 1000}s`);