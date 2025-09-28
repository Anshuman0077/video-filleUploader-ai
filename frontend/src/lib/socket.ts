import { io, Socket } from 'socket.io-client';
import { VideoUploadProgress, ProcessingProgress, SocketConnectionState } from '@/types';

class SocketService {
  private socket: Socket | null = null;
  private videoId: string | null = null;
  private connectionState: SocketConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private connectionCallbacks: ((state: SocketConnectionState) => void)[] = [];

  constructor() {
    this.setupGlobalErrorHandling();
  }

  private setupGlobalErrorHandling() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 Network connection restored');
        if (this.videoId) {
          this.reconnect();
        }
      });

      window.addEventListener('offline', () => {
        console.warn('🌐 Network connection lost');
        this.setConnectionState('disconnected');
      });
    }
  }

  connect(videoId: string, token?: string): Socket {
    // Validate videoId
    if (!videoId || typeof videoId !== 'string' || videoId.length < 10) {
      throw new Error('Invalid video ID provided for socket connection');
    }

    // If already connected to the same video, return existing socket
    if (this.socket?.connected && this.videoId === videoId) {
      return this.socket;
    }
    
    // Cleanup previous connection
    this.disconnect();
    this.videoId = videoId;
    this.setConnectionState('connecting');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    
    this.socket = io(apiUrl, {
      auth: { 
        token: token || '',
        videoId: videoId 
      },
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      query: {
        clientType: 'web',
        clientVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
      }
    });

    this.setupEventHandlers();
    return this.socket;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.setConnectionState('connected');
      
      if (this.videoId) {
        this.socket?.emit('join-video-room', this.videoId);
        console.log(`🎯 Joined video room: ${this.videoId}`);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      this.setConnectionState('disconnected');
      
      if (reason === 'io server disconnect') {
        // Server intentionally disconnected, need to manually reconnect
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      this.reconnectAttempts++;
      this.setConnectionState('error');
      
      // Exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`⏳ Next reconnection attempt in ${delay}ms`);
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      this.setConnectionState('error');
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.log(`🔄 Socket reconnected after ${attempt} attempts`);
      this.setConnectionState('connected');
      
      if (this.videoId) {
        this.socket?.emit('join-video-room', this.videoId);
      }
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Reconnection attempt ${attempt}`);
      this.setConnectionState('reconnecting');
    });

    this.socket.io.on('reconnect_error', (error) => {
      console.error('❌ Reconnection error:', error);
      this.setConnectionState('error');
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('💥 Reconnection failed after all attempts');
      this.setConnectionState('error');
    });
  }

  private setConnectionState(state: SocketConnectionState) {
    this.connectionState = state;
    this.connectionCallbacks.forEach(callback => callback(state));
  }

  onConnectionChange(callback: (state: SocketConnectionState) => void) {
    this.connectionCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.connectionCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionCallbacks.splice(index, 1);
      }
    };
  }

  // Enhanced event listeners with validation
  onVideoProcessed(callback: (data: any) => void) {
    this.socket?.on('video-processed', (data) => {
      if (this.validateVideoData(data)) {
        callback(data);
      } else {
        console.warn('⚠️ Invalid video-processed data received:', data);
      }
    });
  }

  onProcessingProgress(callback: (data: ProcessingProgress) => void) {
    this.socket?.on('processing-progress', (data) => {
      if (this.validateProgressData(data)) {
        callback(data);
      } else {
        console.warn('⚠️ Invalid progress data received:', data);
      }
    });
  }

  onVideoUploaded(callback: (data: VideoUploadProgress) => void) {
    this.socket?.on('video-uploaded', (data) => {
      if (this.validateVideoData(data)) {
        callback(data);
      } else {
        console.warn('⚠️ Invalid video-uploaded data received:', data);
      }
    });
  }

  onError(callback: (error: { message: string; code?: string }) => void) {
    this.socket?.on('error', (error) => {
      if (error && typeof error.message === 'string') {
        callback(error);
      } else {
        console.warn('⚠️ Invalid error data received:', error);
      }
    });
  }

  onRoomJoined(callback: (data: { videoId: string }) => void) {
    this.socket?.on('room-joined', (data) => {
      if (data && data.videoId && data.videoId === this.videoId) {
        callback(data);
      }
    });
  }

  // Validation methods
  private validateVideoData(data: any): boolean {
    return data && 
           typeof data.videoId === 'string' && 
           data.videoId.length >= 10 &&
           typeof data.status === 'string';
  }

  private validateProgressData(data: any): boolean {
    return data && 
           this.validateVideoData(data) &&
           typeof data.phase === 'string' &&
           typeof data.progress === 'number' &&
           data.progress >= 0 &&
           data.progress <= 100;
  }

  // Remove event listeners
  offVideoProcessed(callback: (data: any) => void) {
    this.socket?.off('video-processed', callback);
  }

  offProcessingProgress(callback: (data: ProcessingProgress) => void) {
    this.socket?.off('processing-progress', callback);
  }

  // Enhanced connection management
  disconnect() {
    if (this.socket) {
      if (this.videoId) {
        this.socket.emit('leave-video-room', this.videoId);
      }
      this.socket.disconnect();
      this.socket = null;
      this.videoId = null;
      this.setConnectionState('disconnected');
      console.log('🔌 Socket disconnected and cleaned up');
    }
  }

  reconnect() {
    if (this.videoId && !this.socket?.connected) {
      console.log('🔄 Attempting to reconnect socket...');
      this.socket?.connect();
    }
  }

  // Connection state methods
  isConnected(): boolean {
    return this.connectionState === 'connected' && (this.socket?.connected || false);
  }

  getConnectionState(): SocketConnectionState {
    return this.connectionState;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  getVideoId(): string | null {
    return this.videoId;
  }

  // Health check
  async checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      this.socket.emit('ping', () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  // Cleanup method for component unmounting
  destroy() {
    this.disconnect();
    this.connectionCallbacks = [];
  }
}

// Create singleton instance with error handling
export const socketService = new SocketService();

// Export connection state type for convenience
export type { SocketConnectionState };