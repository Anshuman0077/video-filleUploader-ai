import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - FIXED: Correct path resolution
dotenv.config({ 
  path: path.resolve(__dirname, '../../.env') 
});

// Define required and optional environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'REDIS_HOST',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLERK_SECRET_KEY',
  'GEMINI_API_KEY'
];

const optionalEnvVars = {
  'NODE_ENV': 'development',
  'PORT': '5000',
  'FRONTEND_URL': 'http://localhost:3000',
  'DB_NAME': 'video-qa-app',
  'REDIS_PORT': '6379', // ADDED: Missing Redis port default
  'REDIS_PASSWORD': '', // ADDED: Missing Redis password default
  'WORKER_CONCURRENCY': '1',
  'WORKER_LOCK_DURATION': '1800000',
  'WORKER_STALLED_INTERVAL': '600000',
  'WORKER_GRACE_TIMEOUT_MS': '300000',
  'DOWNLOAD_TOTAL_TIMEOUT_MS': '1200000',
  'DOWNLOAD_INACTIVITY_TIMEOUT_MS': '120000',
  'JOB_MAX_ATTEMPTS': '3',
  'JOB_TIMEOUT_MS': '1800000',
  'CHROMA_DB_PATH': './chroma_db',
  'VECTOR_DIMENSION': '768',
  'SIMILARITY_TOP_K': '5',
  'AUTO_CHUNK_DURATION': '30',
  'MAX_CHUNK_SIZE': '25MB',
  'HUGGINGFACE_API_KEY': ''
};

// Enhanced validation function
const validateEnvironment = () => {
  const errors = [];
  const warnings = [];

  // Check required variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    } else if (varName.includes('KEY') || varName.includes('SECRET')) {
      // Basic validation for secrets
      if (process.env[varName].length < 10) {
        warnings.push(`Environment variable ${varName} seems too short to be valid`);
      }
    }
  }

  // Set defaults for optional variables
  for (const [varName, defaultValue] of Object.entries(optionalEnvVars)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      console.log(`ℹ️  Set default for ${varName}: ${defaultValue}`);
    }
  }

  // Validate numeric variables
  const numericVars = [
    'WORKER_CONCURRENCY',
    'WORKER_LOCK_DURATION', 
    'WORKER_STALLED_INTERVAL',
    'WORKER_GRACE_TIMEOUT_MS',
    'DOWNLOAD_TOTAL_TIMEOUT_MS',
    'DOWNLOAD_INACTIVITY_TIMEOUT_MS',
    'JOB_MAX_ATTEMPTS',
    'JOB_TIMEOUT_MS',
    'PORT',
    'REDIS_PORT', // ADDED: Validate Redis port
    'VECTOR_DIMENSION',
    'SIMILARITY_TOP_K'
  ];
  
  for (const varName of numericVars) {
    const value = process.env[varName];
    if (value && isNaN(Number(value))) {
      errors.push(`Invalid value for ${varName}: ${value}. Must be a number.`);
    }
  }

  // Validate URLs
  const urlVars = ['MONGODB_URI', 'FRONTEND_URL'];
  for (const varName of urlVars) {
    const value = process.env[varName];
    if (value) {
      // Allow MongoDB local URLs (mongodb://localhost:27017)
      if (varName === 'MONGODB_URI' && value.startsWith('mongodb://')) {
        continue; // Skip validation for MongoDB local URLs
      }
      if (!value.match(/^https?:\/\/.+/)) {
        warnings.push(`Environment variable ${varName} may not be a valid URL: ${value}`);
      }
    }
  }

  // Validate file paths
  const pathVars = ['CHROMA_DB_PATH'];
  for (const varName of pathVars) {
    const value = process.env[varName];
    if (value && value.includes('..')) {
      warnings.push(`Environment variable ${varName} contains relative path components: ${value}`);
    }
  }

  return { errors, warnings };
};

// Apply environment configuration
const applyEnvironmentConfig = () => {
  const { errors, warnings } = validateEnvironment();

  // Display warnings
  if (warnings.length > 0) {
    console.warn('⚠️  Environment configuration warnings:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  // Display errors and exit if critical
  if (errors.length > 0) {
    console.error('❌ Critical environment configuration errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    console.error('👉 Please check your .env file configuration.');
    process.exit(1);
  }

  // Security warnings for development
  if (process.env.NODE_ENV === 'development') {
    if (process.env.CLERK_SECRET_KEY && process.env.CLERK_SECRET_KEY.includes('test')) {
      console.warn('⚠️  Using test Clerk secret key in development');
    }
    
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.includes('AIza')) {
      console.warn('⚠️  Using real Gemini API key in development');
    }
  }

  // Log successful configuration
  console.log('✅ Environment variables loaded and validated.');
  console.log('📋 Application Configuration:');
  console.log(`   - Environment: ${process.env.NODE_ENV}`);
  console.log(`   - Port: ${process.env.PORT}`);
  console.log(`   - Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`   - Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  
  console.log('📋 Worker Configuration:');
  console.log(`   - Concurrency: ${process.env.WORKER_CONCURRENCY}`);
  console.log(`   - Lock Duration: ${Number(process.env.WORKER_LOCK_DURATION) / 1000}s`);
  
  // Security recommendations
  if (process.env.NODE_ENV === 'production') {
    console.log('🔒 Production Security Recommendations:');
    console.log('   - Use strong API keys with limited permissions');
    console.log('   - Enable SSL/TLS for all connections');
    console.log('   - Regularly rotate secrets and API keys');
    console.log('   - Monitor and log all API usage');
  }
};

// Initialize environment configuration
applyEnvironmentConfig();

// Export validation function for use in other modules
export const validateEnvVar = (varName, expectedType = 'string') => {
  const value = process.env[varName];
  
  if (!value) {
    throw new Error(`Environment variable ${varName} is required`);
  }
  
  switch (expectedType) {
    case 'number':
      if (isNaN(Number(value))) {
        throw new Error(`Environment variable ${varName} must be a number`);
      }
      return Number(value);
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'array':
      return value.split(',').map(item => item.trim());
    default:
      return value;
  }
};

export default process.env;