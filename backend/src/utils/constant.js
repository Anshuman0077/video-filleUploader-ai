// import './config/env.js'; // This should be removed - env should be loaded once at app entry
import "../config/env.js"

// Enhanced constants with validation
export const DB_NAME = process.env.DB_NAME || "video-qa-app";

export const VIDEO_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing", 
  COMPLETED: "completed",
  FAILED: "failed"
};

// Validate VIDEO_STATUS values
export const isValidVideoStatus = (status) => {
  return Object.values(VIDEO_STATUS).includes(status);
};

export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/webm',
  'video/x-matroska'
];

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const SUPPORTED_LANGUAGES = [
  'english', 'spanish', 'french', 'german', 'italian',
  'portuguese', 'russian', 'chinese', 'japanese', 'korean',
  'hindi', 'arabic', 'bengali', 'urdu', 'turkish'
];

// Enhanced validation functions
export const validateVideoFormat = (mimeType, filename) => {
  const extension = filename ? filename.toLowerCase().split('.').pop() : '';
  const allowedExtensions = ['mp4', 'mpeg', 'mov', 'avi', 'wmv', 'webm', 'mkv'];
  
  return SUPPORTED_VIDEO_FORMATS.includes(mimeType) || 
         allowedExtensions.includes(extension);
};

export const validateFileSize = (size) => {
  return size <= MAX_FILE_SIZE && size > 0;
};

export const validateLanguage = (language) => {
  return SUPPORTED_LANGUAGES.includes(language.toLowerCase());
};

// Configuration validation
export const validateConstants = () => {
  const errors = [];
  
  if (MAX_FILE_SIZE <= 0) {
    errors.push('MAX_FILE_SIZE must be positive');
  }
  
  if (SUPPORTED_VIDEO_FORMATS.length === 0) {
    errors.push('SUPPORTED_VIDEO_FORMATS cannot be empty');
  }
  
  if (SUPPORTED_LANGUAGES.length === 0) {
    errors.push('SUPPORTED_LANGUAGES cannot be empty');
  }
  
  if (errors.length > 0) {
    throw new Error(`Constant validation failed: ${errors.join(', ')}`);
  }
};

// Initialize validation on import
validateConstants();

export default {
  DB_NAME,
  VIDEO_STATUS,
  SUPPORTED_VIDEO_FORMATS,
  MAX_FILE_SIZE,
  SUPPORTED_LANGUAGES,
  validateVideoFormat,
  validateFileSize,
  validateLanguage,
  isValidVideoStatus
};