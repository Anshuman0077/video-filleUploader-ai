export interface Video {
  _id: string;
  title: string;
  description: string;
  url?: string;
  cloudinaryUrl?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  uploadedAt: string;
  createdAt?: string;
  processedAt?: string;
  transcript?: string;
  summary?: string;
  keyPoints?: string[];
  language?: string;
  fileSize?: number;
  mimeType?: string;
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
}

export interface Message {
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  id?: string;
  videoId?: string;
}

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  error?: string;
  errors?: string[];
}

export interface StandardApiResponse<T> {
  message: string;
  data: T;
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
}

export interface User {
  id: string;
  email?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
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
  };
  'room-joined': { videoId: string };
  'error': { message: string };
  'processing-progress': { videoId: string; phase: string; progress: number };
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
}

export interface FormData {
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
}

export interface ProcessingProgress {
  phase: 'download' | 'transcription' | 'summary' | 'embeddings' | 'finalizing' | 'completed';
  progress: number;
  retryAttempt?: number;
  lastError?: string;
}