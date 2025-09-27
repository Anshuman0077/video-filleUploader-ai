import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure temp directory exists
export const TEMP_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Video file filter
const videoFilter = (req, file, cb) => {
  const allowedTypes = /mp4|mov|avi|wmv|flv|webm|mkv/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only video files are allowed'), false);
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Multer configuration
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 1
  },
  fileFilter: function (_req, file, cb) {
    return videoFilter(_req, file, cb);
  }
});

// Clean up temporary file
export const cleanupTempFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Cleaned up temp file: ${filePath}`);
    }
  } catch (error) {
    console.warn('Failed to cleanup temp file:', error.message);
  }
};