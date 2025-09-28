import axios, { AxiosInstance, AxiosError, AxiosResponse } from "axios";
import { 
  Video, 
  Question, 
  PaginatedResponse, 
  UploadResponse, 
  VideoFilters, 
  ApiError,
  HealthCheck,
  UploadFormData,
  StandardApiResponse, 
  ValidationResult
} from "@/types";

// Enhanced configuration with validation
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 30000;

// Validate environment configuration
const validateEnvironment = (): void => {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    console.warn('⚠️ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Authentication may not work properly.');
  }
  
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }
  
  // Validate URL format
  try {
    new URL(API_BASE_URL);
  } catch (error) {
    throw new Error(`Invalid API_BASE_URL: ${API_BASE_URL}`);
  }
};

// Initialize environment validation
try {
  validateEnvironment();
} catch (error) {
  console.error('❌ Environment validation failed:', error);
}

class ApiClientError extends Error {
  public status: number;
  public code?: string;
  public errors?: string[];
  public timestamp: string;
  public retryable: boolean;

  constructor(message: string, status: number, code?: string, errors?: string[], retryable: boolean = false) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.timestamp = new Date().toISOString();
    this.retryable = retryable;
    
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }

  toJSON() {
    return {
      message: this.message,
      status: this.status,
      code: this.code,
      errors: this.errors,
      timestamp: this.timestamp,
      retryable: this.retryable,
      name: this.name
    };
  }
}

class ApiClient {
  private axiosInstance: AxiosInstance;
  private retryAttempts: number;
  private baseRetryDelay: number;

  constructor() {
    this.retryAttempts = MAX_RETRY_ATTEMPTS;
    this.baseRetryDelay = BASE_RETRY_DELAY;
    
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor with enhanced security
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const requestId = Math.random().toString(36).substring(2, 15);
        config.headers['X-Request-ID'] = requestId;
        
        if (typeof window !== "undefined") {
          try {
            // Enhanced Clerk token handling
            const clerk = (window as any).Clerk;
            if (clerk && clerk.session) {
              const token = await clerk.session.getToken();
              if (token && typeof token === 'string' && token.length > 10) {
                config.headers["Authorization"] = `Bearer ${token}`;
              } else {
                console.warn('⚠️ Invalid or missing auth token');
              }
            }
          } catch (error) {
            console.warn('🔐 Auth token retrieval failed:', error);
            // Don't throw here to allow public endpoints to work
          }
        }

        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
            headers: config.headers,
            data: config.data instanceof FormData ? '[FormData]' : config.data
          });
        }

        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(this.enhanceError(error));
      }
    );

    // Response interceptor with enhanced error handling
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log successful responses in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ API Response: ${response.status} ${response.config.url}`, {
            data: response.data
          });
        }
        
        return response;
      },
      (error: AxiosError) => {
        const enhancedError = this.handleApiError(error);
        
        // Log errors appropriately
        if (enhancedError.status >= 500) {
          console.error('❌ Server error:', enhancedError);
        } else if (enhancedError.status >= 400) {
          console.warn('⚠️ Client error:', enhancedError);
        }
        
        return Promise.reject(enhancedError);
      }
    );
  }

  private handleApiError(error: AxiosError): ApiClientError {
    if (error.code === 'ECONNABORTED') {
      return new ApiClientError(
        'Request timeout - please try again',
        408,
        'REQUEST_TIMEOUT',
        undefined,
        true
      );
    }

    if (error.response) {
      const data = error.response.data as any;
      const status = error.response.status;
      
      // Enhanced error categorization
      let retryable = false;
      if (status >= 500 || status === 429) {
        retryable = true;
      }

      return new ApiClientError(
        data?.message || data?.error || `Server error (${status})`,
        status,
        data?.code,
        data?.errors,
        retryable
      );
    } else if (error.request) {
      return new ApiClientError(
        'Network error - please check your internet connection',
        0,
        'NETWORK_ERROR',
        undefined,
        true
      );
    } else {
      return new ApiClientError(
        error.message || 'Unknown error occurred',
        0,
        'UNKNOWN_ERROR'
      );
    }
  }

  private enhanceError(error: any): ApiClientError {
    if (error instanceof ApiClientError) {
      return error;
    }
    
    return new ApiClientError(
      error.message || 'Unexpected error',
      error.status || 0,
      error.code,
      error.errors
    );
  }

  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    operationName: string,
    attempts: number = this.retryAttempts
  ): Promise<T> {
    let lastError: ApiClientError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = this.enhanceError(error);
        
        // Only retry on retryable errors
        if (attempt < attempts && lastError.retryable) {
          const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);
          console.warn(`🔄 ${operationName} attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    throw lastError;
  }

  // Enhanced file validation
  private validateFile(file: File): ValidationResult {
    const errors: string[] = [];
    const maxSize = 500 * 1024 * 1024; // 500MB
    const allowedTypes = [
      'video/mp4', 'video/mpeg', 'video/quicktime', 
      'video/x-msvideo', 'video/webm', 'video/x-matroska'
    ];

    if (!file) {
      errors.push('No file selected');
    } else {
      if (file.size > maxSize) {
        errors.push(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
      }
      
      if (!allowedTypes.includes(file.type)) {
        errors.push('Invalid file type. Supported formats: MP4, MPEG, MOV, AVI, WebM, MKV');
      }
      
      // Basic filename validation
      if (file.name.length > 255) {
        errors.push('Filename too long');
      }
      
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(file.name)) {
        errors.push('Filename contains invalid characters');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validateUploadForm(formData: UploadFormData): ValidationResult {
    const errors: string[] = [];

    if (!formData.title?.trim()) {
      errors.push('Title is required');
    } else if (formData.title.length > 200) {
      errors.push('Title must be less than 200 characters');
    }

    if (formData.description && formData.description.length > 1000) {
      errors.push('Description must be less than 1000 characters');
    }

    if (!formData.file) {
      errors.push('Video file is required');
    } else {
      const fileValidation = this.validateFile(formData.file);
      errors.push(...fileValidation.errors);
    }

    const supportedLanguages = ['english', 'spanish', 'french', 'german', 'hindi', 'chinese'];
    if (formData.language && !supportedLanguages.includes(formData.language)) {
      errors.push(`Unsupported language. Supported: ${supportedLanguages.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Enhanced Video APIs
  async uploadVideo(formData: UploadFormData): Promise<UploadResponse['data']> {
    // Client-side validation
    const validation = this.validateUploadForm(formData);
    if (!validation.isValid) {
      throw new ApiClientError(
        'Upload validation failed',
        400,
        'VALIDATION_ERROR',
        validation.errors
      );
    }

    return this.retryRequest(async () => {
      const uploadFormData = new FormData();
      if (formData.file) uploadFormData.append('video', formData.file);
      uploadFormData.append('title', formData.title.trim());
      uploadFormData.append('description', formData.description?.trim() || '');
      if (formData.language) uploadFormData.append('language', formData.language);

      const response = await this.axiosInstance.post<StandardApiResponse<UploadResponse['data']>>(
        "/videos/upload", 
        uploadFormData, 
        {
          headers: { 
            "Content-Type": "multipart/form-data",
            "X-Upload-Filename": formData.file?.name || 'unknown'
          },
          timeout: 300000, // 5 minutes for large uploads
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && progressEvent.total > 0) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              
              // Enhanced progress event with more context
              window.dispatchEvent(new CustomEvent('upload-progress', { 
                detail: { 
                  progress,
                  loaded: progressEvent.loaded,
                  total: progressEvent.total,
                  filename: formData.file?.name
                } 
              }));
            }
          },
        }
      );
      
      return response.data.data;
    }, "Video upload");
  }

  async getMyVideos(filters?: VideoFilters): Promise<PaginatedResponse<Video>> {
    return this.retryRequest(async () => {
      const params = new URLSearchParams();
      
      // Enhanced parameter validation
      if (filters?.page) {
        const page = Math.max(1, parseInt(filters.page.toString()));
        params.append('page', page.toString());
      }
      
      if (filters?.limit) {
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit.toString())));
        params.append('limit', limit.toString());
      }
      
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search.trim());
      
      const response = await this.axiosInstance.get<StandardApiResponse<PaginatedResponse<Video>>>(
        `/videos/my-videos?${params.toString()}`
      );
      
      return response.data.data;
    }, "Fetch videos");
  }

  async getVideo(id: string): Promise<Video> {
    // Enhanced ID validation
    if (!id || typeof id !== 'string' || id.length < 10) {
      throw new ApiClientError('Invalid video ID format', 400, 'INVALID_ID');
    }
    
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<StandardApiResponse<Video>>(`/videos/${id}`);
      return response.data.data;
    }, "Fetch video");
  }

  async getVideoTranscript(id: string): Promise<{ transcript: string }> {
    if (!id || typeof id !== 'string') {
      throw new ApiClientError('Invalid video ID', 400, 'INVALID_ID');
    }
    
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<StandardApiResponse<{ transcript: string }>>(
        `/videos/${id}/transcript`
      );
      return response.data.data;
    }, "Fetch transcript");
  }

  // Enhanced Question APIs
  async askQuestion(videoId: string, question: string, language?: string): Promise<Question> {
    // Enhanced input validation
    if (!videoId || typeof videoId !== 'string') {
      throw new ApiClientError('Valid video ID is required', 400, 'INVALID_VIDEO_ID');
    }
    
    if (!question?.trim()) {
      throw new ApiClientError('Question is required', 400, 'EMPTY_QUESTION');
    }
    
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length > 1000) {
      throw new ApiClientError('Question must be less than 1000 characters', 400, 'QUESTION_TOO_LONG');
    }
    
    // Security: basic injection prevention
    const dangerousPattern = /[<>$`|&;{}()[\]]/;
    if (dangerousPattern.test(trimmedQuestion)) {
      throw new ApiClientError('Question contains invalid characters', 400, 'INVALID_CHARACTERS');
    }

    return this.retryRequest(async () => {
      const payload: any = {
        videoId: videoId.trim(),
        question: trimmedQuestion,
      };
      if (language) payload.language = language;

      const response = await this.axiosInstance.post<StandardApiResponse<Question>>(
        "/questions/ask", 
        payload
      );
      return response.data.data;
    }, "Ask question");
  }

  async getVideoQuestions(videoId: string): Promise<Question[]> {
    if (!videoId || typeof videoId !== 'string') {
      throw new ApiClientError('Invalid video ID', 400, 'INVALID_ID');
    }
    
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<StandardApiResponse<Question[]>>(
        `/questions/video/${videoId}`
      );
      return response.data.data;
    }, "Fetch video questions");
  }

  async generateSummary(videoId: string, language?: string): Promise<{ summary: string }> {
    if (!videoId || typeof videoId !== 'string') {
      throw new ApiClientError('Invalid video ID', 400, 'INVALID_ID');
    }
    
    return this.retryRequest(async () => {
      const payload: any = { videoId };
      if (language) payload.language = language;

      const response = await this.axiosInstance.post<StandardApiResponse<{ summary: string }>>(
        "/questions/generate-summary",
        payload
      );
      return response.data.data;
    }, "Generate summary");
  }

  // Enhanced Utility Methods
  async healthCheck(): Promise<HealthCheck> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<HealthCheck>('/health');
      return response.data;
    }, "Health check");
  }

  async advancedHealthCheck(): Promise<HealthCheck> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<HealthCheck>('/api/health/advanced');
      return response.data;
    }, "Advanced health check");
  }

  // Method to check if the client is properly configured
  isConfigured(): boolean {
    return !!API_BASE_URL && API_BASE_URL !== 'http://localhost:5000/api';
  }

  // Method to get current configuration
  getConfig() {
    return {
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      maxRetries: this.retryAttempts,
      version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
    };
  }
}

// Create singleton instance
export const apiClient = new ApiClient();
export { ApiClientError };

// Utility function for API error handling in components
export const handleApiError = (error: unknown, fallbackMessage: string = 'An error occurred'): ApiError => {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      errors: error.errors,
    };
  }
  
  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN_ERROR',
    };
  }
  
  return {
    message: fallbackMessage,
    code: 'UNKNOWN_ERROR',
  };
};