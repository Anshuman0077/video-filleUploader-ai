import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced temporary directory management
export const TEMP_DIR = path.join(__dirname, '../../temp');

const ensureTempDir = () => {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true, mode: 0o755 });
      console.log(`✅ Created temp directory: ${TEMP_DIR}`);
    }
    
    // Set proper permissions
    fs.chmodSync(TEMP_DIR, 0o755);
  } catch (error) {
    console.error('❌ Failed to create temp directory:', error);
    throw new Error('Failed to initialize upload directory');
  }
};

// Initialize temp directory on startup
ensureTempDir();

// Enhanced video file validation with magic numbers
const getFileSignature = (filePath) => {
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    return buffer.toString('hex').toUpperCase();
  } catch (error) {
    return null;
  }
};

// Magic numbers for common video formats
const VIDEO_SIGNATURES = {
  'mp4': ['6674797069736F6D', '0000001866747970'], // ftypisoM, ftyp
  'avi': ['52494646', '41564920'], // RIFF, AVI
  'mov': ['6674797071742020', '6D6F6F76'], // ftypqt, moov
  'wmv': ['3026B2758E66CF11'], // ASF header
  'flv': ['464C5601'], // FLV
  'webm': ['1A45DFA3'], // EBML
  'mkv': ['1A45DFA3'] // EBML (same as webm)
};

const isValidVideoSignature = (filePath, originalExtension) => {
  const signature = getFileSignature(filePath);
  if (!signature) return false;

  const expectedSignatures = VIDEO_SIGNATURES[originalExtension.toLowerCase()];
  if (!expectedSignatures) return true; // If we don't have signatures for this type, skip validation

  return expectedSignatures.some(sig => signature.startsWith(sig));
};

// Enhanced file filter with multiple validation layers
const videoFilter = (req, file, cb) => {
  const errors = [];

  // MIME type validation
  const allowedMimeTypes = [
    'video/mp4', 'video/mpeg', 'video/quicktime', 
    'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv',
    'video/webm', 'video/x-matroska'
  ];
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    errors.push(`Unsupported MIME type: ${file.mimetype}`);
  }

  // File extension validation
  const allowedExtensions = ['.mp4', '.mpeg', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    errors.push(`Unsupported file extension: ${fileExtension}`);
  }

  // File size validation (client-side indication)
  const maxSize = 500 * 1024 * 1024; // 500MB
  if (file.size > maxSize) {
    errors.push(`File size exceeds limit: ${(file.size / (1024 * 1024)).toFixed(2)}MB > 500MB`);
  }

  // Filename security validation
  const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (sanitizedFilename !== file.originalname) {
    console.warn(`Filename sanitized: ${file.originalname} -> ${sanitizedFilename}`);
  }

  if (errors.length > 0) {
    console.error('File validation errors:', errors);
    return cb(new Error(`File validation failed: ${errors.join(', ')}`), false);
  }

  cb(null, true);
};

// Enhanced storage configuration with security features
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      ensureTempDir();
      cb(null, TEMP_DIR);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: function (req, file, cb) {
    try {
      // Generate secure filename with random component
      const uniqueSuffix = crypto.randomBytes(8).toString('hex') + '-' + Date.now();
      const originalExtension = path.extname(file.originalname);
      
      // Sanitize filename to prevent path traversal
      const baseName = path.basename(file.originalname, originalExtension)
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .substring(0, 100); // Limit filename length
      
      const secureFilename = `video_${baseName}_${uniqueSuffix}${originalExtension}`;
      cb(null, secureFilename);
    } catch (error) {
      cb(error, null);
    }
  }
});

// Multer configuration with enhanced security
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 1,
    fields: 10, // Limit number of non-file fields
    headerPairs: 20 // Limit header key-value pairs
  },
  fileFilter: function (req, file, cb) {
    // Race condition protection: check if temp directory still exists
    if (!fs.existsSync(TEMP_DIR)) {
      try {
        ensureTempDir();
      } catch (error) {
        return cb(new Error('Upload directory unavailable'), false);
      }
    }

    return videoFilter(req, file, cb);
  },
  preservePath: false // Don't include full path in filename
});

// Enhanced magic number validation middleware
export const validateFileType = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const filePath = req.file.path;
    const originalExtension = path.extname(req.file.originalname).toLowerCase().replace('.', '');

    // Check if file exists and is accessible
    if (!fs.existsSync(filePath)) {
      await cleanupTempFile(filePath);
      return res.status(400).json({ 
        message: 'Uploaded file not found or inaccessible.',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Validate file signature (magic numbers)
    if (!isValidVideoSignature(filePath, originalExtension)) {
      await cleanupTempFile(filePath);
      return res.status(400).json({ 
        message: 'Invalid file type. The file does not appear to be a valid video.',
        code: 'INVALID_FILE_SIGNATURE'
      });
    }

    // Additional security: check file size matches what was reported
    const stats = fs.statSync(filePath);
    if (stats.size !== req.file.size) {
      await cleanupTempFile(filePath);
      return res.status(400).json({ 
        message: 'File size mismatch detected.',
        code: 'FILE_SIZE_MISMATCH'
      });
    }

    // Security: ensure file is within temp directory
    const resolvedFilePath = path.resolve(filePath);
    const resolvedTempDir = path.resolve(TEMP_DIR);
    
    if (!resolvedFilePath.startsWith(resolvedTempDir)) {
      await cleanupTempFile(filePath);
      return res.status(400).json({ 
        message: 'Invalid file path detected.',
        code: 'PATH_TRAVERSAL_ATTEMPT'
      });
    }

    next();
  } catch (error) {
    console.error('File validation error:', error);
    
    // Cleanup on error
    if (req.file && req.file.path) {
      await cleanupTempFile(req.file.path).catch(() => {});
    }
    
    return res.status(500).json({ 
      message: 'Error validating uploaded file.',
      code: 'FILE_VALIDATION_ERROR'
    });
  }
};

// Enhanced cleanup function with error handling
export const cleanupTempFile = async (filePath) => {
  if (!filePath) return;

  try {
    const resolvedPath = path.resolve(filePath);
    const resolvedTempDir = path.resolve(TEMP_DIR);

    // Security: only delete files within temp directory
    if (!resolvedPath.startsWith(resolvedTempDir)) {
      console.warn('⚠️ Attempted to cleanup file outside temp directory:', resolvedPath);
      return;
    }

    if (fs.existsSync(resolvedPath)) {
      await promisify(fs.unlink)(resolvedPath);
      console.log(`🧹 Cleaned up temp file: ${path.basename(resolvedPath)}`);
    }
  } catch (error) {
    console.warn('⚠️ Failed to cleanup temp file:', error.message);
    
    // If cleanup fails, try to schedule it for later
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (retryError) {
        console.error('❌ Failed to cleanup temp file on retry:', retryError.message);
      }
    }, 5000);
  }
};

// Bulk cleanup function for multiple files
export const cleanupTempFiles = async (filePaths) => {
  if (!Array.isArray(filePaths)) return;

  const cleanupPromises = filePaths.map(filePath => cleanupTempFile(filePath));
  await Promise.allSettled(cleanupPromises);
};

// Periodic temp directory cleanup
const cleanStaleTempFiles = async () => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          await cleanupTempFile(filePath);
        }
      } catch (error) {
        console.warn(`Could not clean up stale file ${file}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error cleaning stale temp files:', error);
  }
};

// Run cleanup every hour
setInterval(cleanStaleTempFiles, 60 * 60 * 1000);

// Export validation function for use in routes
export const validateUpload = [upload.single('video'), validateFileType];