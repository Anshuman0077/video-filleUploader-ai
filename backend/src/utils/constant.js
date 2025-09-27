export const DB_NAME = "video-qa-app";

export const VIDEO_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing", 
  COMPLETED: "completed",
  FAILED: "failed"
};

export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo', // .avi
  'video/x-ms-wmv', // .wmv
  'video/webm'
];

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const SUPPORTED_LANGUAGES = [
  'english',
  'spanish', 
  'french',
  'german',
  'italian',
  'portuguese',
  'russian',
  'chinese',
  'japanese',
  'korean',
  'hindi',
  'arabic',
  'bengali',
  'urdu',
  'turkish'
];