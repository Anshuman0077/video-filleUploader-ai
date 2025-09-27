import axios, { AxiosInstance, AxiosError } from "axios";
import { Video, Question, PaginatedResponse, UploadResponse, VideoFilters } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface StandardApiResponse<T> {
  message: string;
  data: T;
}

class ApiClientError extends Error {
  public status: number;
  public code?: string;
  public errors?: string[];

  constructor(message: string, status: number, code?: string, errors?: string[]) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

class ApiClient {
  private axiosInstance: AxiosInstance;
  private retryAttempts = 3;
  private retryDelay = 1000;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        if (typeof window !== "undefined") {
          try {
            // Clerk token handling
            const clerk = (window as any).Clerk;
            if (clerk) {
              const token = await clerk.session?.getToken();
              if (token) {
                config.headers["Authorization"] = `Bearer ${token}`;
              }
            }
          } catch (error) {
            console.warn('Failed to get auth token:', error);
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const apiError = this.handleApiError(error);
        return Promise.reject(apiError);
      }
    );
  }

  private handleApiError(error: AxiosError): ApiClientError {
    if (error.response) {
      const data = error.response.data as any;
      return new ApiClientError(
        data?.message || data?.error || 'Server error',
        error.response.status,
        data?.code,
        data?.errors
      );
    } else if (error.request) {
      return new ApiClientError(
        'Network error - please check your connection',
        0,
        'NETWORK_ERROR'
      );
    } else {
      return new ApiClientError(
        error.message || 'Unknown error occurred',
        0,
        'UNKNOWN_ERROR'
      );
    }
  }

  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempts: number = this.retryAttempts
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempts > 1 && error instanceof ApiClientError) {
        if (error.code === 'NETWORK_ERROR' || (error.status >= 500 && error.status < 600)) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          return this.retryRequest(requestFn, attempts - 1);
        }
      }
      throw error;
    }
  }

  // Video APIs
  async uploadVideo(formData: { title: string; description: string; file: File | null; language?: string }): Promise<UploadResponse['data']> {
    return this.retryRequest(async () => {
      const uploadFormData = new FormData();
      if (formData.file) uploadFormData.append('video', formData.file);
      uploadFormData.append('title', formData.title);
      uploadFormData.append('description', formData.description);
      if (formData.language) uploadFormData.append('language', formData.language);

      const response = await this.axiosInstance.post<StandardApiResponse<UploadResponse['data']>>(
        "/videos/upload", 
        uploadFormData, 
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              window.dispatchEvent(new CustomEvent('upload-progress', { detail: { progress } }));
            }
          },
        }
      );
      return response.data.data;
    });
  }

  async getMyVideos(filters?: VideoFilters): Promise<PaginatedResponse<Video>> {
    return this.retryRequest(async () => {
      const params = new URLSearchParams();
      
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search);
      
      const response = await this.axiosInstance.get<StandardApiResponse<PaginatedResponse<Video>>>(
        `/videos/my-videos?${params.toString()}`
      );
      
      return response.data.data;
    });
  }

  async getVideo(id: string): Promise<Video> {
    if (!id || typeof id !== 'string') {
      throw new ApiClientError('Invalid video ID', 400, 'INVALID_ID');
    }
    
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<StandardApiResponse<Video>>(`/videos/${id}`);
      return response.data.data;
    });
  }

  async getVideoTranscript(id: string): Promise<{ transcript: string }> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<StandardApiResponse<{ transcript: string }>>(
        `/videos/${id}/transcript`
      );
      return response.data.data;
    });
  }

  // Question APIs
  async askQuestion(videoId: string, question: string, language?: string): Promise<Question> {
    if (!videoId || !question?.trim()) {
      throw new ApiClientError('Video ID and question are required', 400, 'INVALID_INPUT');
    }
    
    return this.retryRequest(async () => {
      const payload: any = {
        videoId: videoId.trim(),
        question: question.trim(),
      };
      if (language) payload.language = language;

      const response = await this.axiosInstance.post<StandardApiResponse<Question>>(
        "/questions/ask", 
        payload
      );
      return response.data.data;
    });
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
    });
  }

  async generateSummary(videoId: string, language?: string): Promise<{ summary: string }> {
    return this.retryRequest(async () => {
      const payload: any = { videoId };
      if (language) payload.language = language;

      const response = await this.axiosInstance.post<StandardApiResponse<{ summary: string }>>(
        "/questions/generate-summary",
        payload
      );
      return response.data.data;
    });
  }

  // Utility Methods
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.axiosInstance.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export { ApiClientError };