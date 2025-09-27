import { io, Socket } from 'socket.io-client';
import { VideoUploadProgress, ProcessingProgress } from '@/types';

class SocketService {
  private socket: Socket | null = null;
  private videoId: string | null = null;

  connect(videoId: string, token?: string): Socket {
    if (this.socket?.connected && this.videoId === videoId) {
      return this.socket;
    }
    
    this.disconnect();
    this.videoId = videoId;

    this.socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    return this.socket;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Socket connected');
      if (this.videoId) {
        this.socket?.emit('join-video-room', this.videoId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.log(`🔄 Socket reconnected after ${attempt} attempts`);
      if (this.videoId) {
        this.socket?.emit('join-video-room', this.videoId);
      }
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Reconnection attempt ${attempt}`);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.videoId = null;
    }
  }

  // Event listeners
  onVideoProcessed(callback: (data: any) => void) {
    this.socket?.on('video-processed', callback);
  }

  onProcessingProgress(callback: (data: ProcessingProgress) => void) {
    this.socket?.on('processing-progress', callback);
  }

  onVideoUploaded(callback: (data: VideoUploadProgress) => void) {
    this.socket?.on('video-uploaded', callback);
  }

  onError(callback: (error: { message: string }) => void) {
    this.socket?.on('error', callback);
  }

  // Remove event listeners
  offVideoProcessed(callback: (data: any) => void) {
    this.socket?.off('video-processed', callback);
  }

  offProcessingProgress(callback: (data: ProcessingProgress) => void) {
    this.socket?.off('processing-progress', callback);
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

export const socketService = new SocketService();