import express from 'express';
import connectDB from './config/database.js';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import { QueueEvents } from 'bullmq';
import redisClient from './config/redis.js';
import { processVideoQueue } from "./queues/video.queue.js";
import VectorDBService from './services/vectorDb.service.js';
import  STTService from "./services/stt.service.js"
// Import routes
import videoRoutes from "./routes/videos.routes.js";
import questionsRoutes from "./routes/questions.routes.js";

// Initialize express app
const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Security middleware
app.use(helmet());

// Disable ETag to avoid 304 Not Modified for API polling
app.set('etag', false);
app.get('/api/health/advanced', async (req, res) => {
  try {
    const [dbStatus, redisStatus, vectorDBStatus, sttStatus] = await Promise.all([
      // Existing checks
      VectorDBService.healthCheck(),
      STTService.checkModelStatus()
    ]);

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        vectorDB: vectorDBStatus,
        stt: sttStatus
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Health check failed' });
  }
});   

// Compression middleware
app.use(compression());

// Add no-store cache headers for API responses to prevent 304s during polling
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.use(limiter);

// CORS configuration
const corsOptions = process.env.NODE_ENV === 'development'
  ? { origin: true, credentials: true }
  : { 
      origin: [process.env.FRONTEND_URL || 'http://localhost:3000'], 
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    };

app.use(cors(corsOptions));
// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Logging middleware for incoming requests
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    const startTime = process.hrtime();
    res.on('finish', () => {
      const totalTime = process.hrtime(startTime);
      const totalTimeInMs = totalTime[0] * 1000 + totalTime[1] / 1e6;
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${totalTimeInMs.toFixed(2)}ms)`);
    });
  }
  next();
});

// Socket.io setup with CORS
const io = new Server(server, {
  cors: corsOptions
});

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Body parsing middleware with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (_req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000
}));

// Static file serving with security
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4') || path.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
  }
}));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check alias for frontend
app.get('/api/health', (_req, res) => res.redirect(307, '/health'));

// API routes
app.use('/api/videos', videoRoutes);
app.use('/api/questions', questionsRoutes);

// Optional auth middleware for sockets (token presence check)
io.use((socket, next) => {
  try {
    const _token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    // Optionally verify token here with your auth provider
    // For now, allow connection even without token to avoid blocking local dev
    return next();
  } catch (e) {
    return next();
  }
});

// Socket.io events with error handling
io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);
  
  socket.on('join-video-room', (videoId) => {
    try {
      // Validate videoId format
      if (typeof videoId !== 'string' || videoId.length < 10) {
        socket.emit('error', { message: 'Invalid video ID' });
        return;
      }
      
      socket.join(videoId);
      console.log(`User ${socket.id} joined video room ${videoId}`);
      
      // Confirm room join
      socket.emit('room-joined', { videoId });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  socket.on('leave-video-room', (videoId) => {
    try {
      socket.leave(videoId);
      console.log(`User ${socket.id} left video room ${videoId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Make io available in routes
app.set('socketio', io);

// Subscribe to BullMQ queue events to emit processing completion
const videoQueueEvents = new QueueEvents('video-processing', { connection: redisClient });

videoQueueEvents.on('completed', async ({ jobId: _jobId, returnvalue }) => {
  try {
    const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
    const videoId = result?.videoId;
    if (videoId) {
      io.to(videoId).emit('video-processed', { 
        videoId, 
        status: 'completed',
        transcript: result.transcript,
        summary: result.summary
      });
    }
  } catch (e) {
    console.error('Error handling completed event:', e);
  }
});

videoQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  try {
    const job = await processVideoQueue.getJob(jobId);
    const videoId = job?.data?.videoId;
    if (videoId) {
      io.to(videoId).emit('video-processed', { 
        videoId, 
        status: 'failed', 
        error: failedReason 
      });
    }
  } catch (e) {
    console.error('Error handling failed event:', e);
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, _next) => {
  console.error('Global error handler:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Handle specific error types
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request entity too large' });
  }
  
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  
  // Default error response
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');  
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});




export { app, io };
export default server;