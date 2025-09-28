// Enhanced TypeScript interfaces with better validation and security
export interface Video {
  _id: string;
  title: string;
  description: string;
  url?: string;
  cloudinaryUrl?: string;
  status: VideoStatus;
  uploadedAt: string;
  createdAt?: string;
  processedAt?: string;
  transcript?: string;
  summary?: string;
  keyPoints?: string[];
  language?: string;
  fileSize?: number;
  mimeType?: string;
  userId: string;
  error?: string;
  duration?: number;
  wordCount?: number;
}

export type VideoStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Question {
  _id: string;
  question: string;
  answer: string;
  videoId: string;
  userId: string;
  language?: string;
  askedAt: string;
  createdAt: string;
  updatedAt: string;
  confidence?: number;
  relevantChunks?: number;
  processingTime?: number;
  isFallback?: boolean;
}

export interface Message {
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  id?: string;
  videoId?: string;
  confidence?: number;
  error?: boolean;
  processingTime?: number;
}

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  error?: string;
  errors?: string[];
  code?: string;
  timestamp?: string;
}

export interface StandardApiResponse<T> {
  message: string;
  data: T;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  videos?: T[];
  data?: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface UploadResponse {
  message: string;
  data: {
    videoId: string;
    status: VideoStatus;
    title: string;
    cloudinaryUrl?: string;
  };
}

export interface VideoUploadProgress {
  videoId: string;
  status: VideoStatus;
  progress?: number;
  error?: string;
  title?: string;
  transcript?: string;
  summary?: string;
  phase?: string;
  timestamp?: string;
}

export interface User {
  id: string;
  email?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  sessionId?: string;
}

export interface SocketEvents {
  'video-uploaded': VideoUploadProgress;
  'video-processing': VideoUploadProgress;
  'video-completed': VideoUploadProgress;
  'video-failed': VideoUploadProgress;
  'video-processed': { 
    videoId: string; 
    status: 'completed' | 'failed'; 
    error?: string;
    transcript?: string;
    summary?: string;
    timestamp?: string;
  };
  'room-joined': { videoId: string };
  'error': { message: string; code?: string };
  'processing-progress': { videoId: string; phase: string; progress: number; timestamp?: string };
}

export interface ServerToClientEvents extends SocketEvents {}
export interface ClientToServerEvents {
  'join-video-room': (videoId: string) => void;
  'leave-video-room': (videoId: string) => void;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  errors?: string[];
  timestamp?: string;
  errorId?: string;
}

export interface UploadFormData {
  title: string;
  description: string;
  file: File | null;
  language?: string;
}

export interface VideoFilters {
  status?: VideoStatus;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProcessingProgress {
  phase: 'download' | 'transcription' | 'summary' | 'embeddings' | 'finalizing' | 'completed';
  progress: number;
  retryAttempt?: number;
  lastError?: string;
  timestamp?: string;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services?: {
    database: { status: string; details: string };
    redis: { status: string; details: string };
    vectorDB: { status: string; details: string };
    stt: { status: string; details: string };
  };
}

// Validation interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Enhanced error types
export interface FrontendError {
  message: string;
  code: string;
  severity: 'low' | 'medium' | 'high';
  retryable: boolean;
  timestamp: string;
  context?: Record<string, any>;
}

// Socket connection state
export type SocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';