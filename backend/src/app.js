import { Server } from 'socket.io';
import express from 'express';
import connectDB from './config/database.js';
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
import STTService from "./services/stt.service.js";

// Import routes
import videoRoutes from "./routes/videos.routes.js";
import questionsRoutes from "./routes/questions.routes.js";

// Initialize express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000']
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Connect to database
connectDB();

// Disable ETag to avoid 304 Not Modified for API polling
app.set('etag', false);

// Enhanced health check with proper Promise.all
app.get('/api/health/advanced', async (req, res) => {
  try {
    const healthChecks = await Promise.allSettled([
      // Database health check
      new Promise((resolve) => {
        const db = require('mongoose');
        resolve({
          status: db.connection.readyState === 1 ? 'healthy' : 'unhealthy',
          details: db.connection.readyState === 1 ? 'Connected' : 'Disconnected'
        });
      }),
      // Redis health check
      new Promise((resolve, reject) => {
        redisClient.ping((err, result) => {
          if (err) reject(err);
          else resolve({
            status: result === 'PONG' ? 'healthy' : 'unhealthy',
            details: result === 'PONG' ? 'Connected' : 'Disconnected'
          });
        });
      }),
      // VectorDB health check
      VectorDBService.healthCheck().then(result => ({
        status: 'healthy',
        details: result
      })).catch(err => ({
        status: 'unhealthy',
        details: err.message
      })),
      // STT service health check
      STTService.checkModelStatus().then(result => ({
        status: 'healthy',
        details: result
      })).catch(err => ({
        status: 'unhealthy',
        details: err.message
      }))
    ]);

    const services = {
      database: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : { status: 'unhealthy', details: healthChecks[0].reason?.message },
      redis: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : { status: 'unhealthy', details: healthChecks[1].reason?.message },
      vectorDB: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : { status: 'unhealthy', details: healthChecks[2].reason?.message },
      stt: healthChecks[3].status === 'fulfilled' ? healthChecks[3].value : { status: 'unhealthy', details: healthChecks[3].reason?.message }
    };

    const allHealthy = Object.values(services).every(service => service.status === 'healthy');
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Health check failed',
      details: error.message 
    });
  }
});

// Compression middleware
app.use(compression());

// Add no-store cache headers for API responses to prevent 304s during polling
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

// Rate limiting with enhanced security
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Different limits for prod/dev
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP address. Please try again later.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000) + ' seconds'
    });
  }
});

app.use(limiter);

// CORS configuration with enhanced security
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client-Version'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 600 // 10 minutes
};

app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Logging middleware for incoming requests
app.use((req, res, next) => {
  const startTime = process.hrtime();
  
  res.on('finish', () => {
    const totalTime = process.hrtime(startTime);
    const totalTimeInMs = totalTime[0] * 1000 + totalTime[1] / 1e6;
    
    const logMessage = `[${req.method}] ${req.originalUrl} - ${res.statusCode} (${totalTimeInMs.toFixed(2)}ms)`;
    
    if (res.statusCode >= 400) {
      console.error(logMessage, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type')
      });
    } else if (process.env.NODE_ENV === 'development') {
      console.log(logMessage);
    }
  });
  
  next();
});

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Body parsing middleware with size limits and enhanced security
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ 
        error: 'Invalid JSON payload',
        message: 'The request body contains invalid JSON'
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100,
  verify: (req, res, buf) => {
    // Basic URL-encoded data validation
    if (buf.length > 10 * 1024 * 1024) { // 10MB max for URL-encoded
      res.status(413).json({ 
        error: 'Payload too large',
        message: 'URL-encoded payload exceeds size limit'
      });
      throw new Error('Payload too large');
    }
  }
}));

// Static file serving with security headers
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Security headers for static files
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    if (filePath.endsWith('.mp4') || filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Health check alias for frontend
app.get('/api/health', (req, res) => res.redirect(307, '/health'));

// API routes
app.use('/api/videos', videoRoutes);
app.use('/api/questions', questionsRoutes);

// Optional auth middleware for sockets (token presence check)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    
    // Basic token validation
    if (token && typeof token === 'string' && token.length > 10) {
      // In production, you would verify the token with your auth provider
      return next();
    }
    
    // Allow connection in development without strict auth
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    
    // In production, require authentication
    const error = new Error('Authentication required');
    error.data = { code: 'AUTH_REQUIRED' };
    return next(error);
  } catch (e) {
    const error = new Error('Authentication error');
    error.data = { code: 'AUTH_ERROR' };
    return next(error);
  }
});

// Socket.io events with enhanced error handling and validation
io.on('connection', (socket) => {
  console.log('User Connected:', socket.id, '- IP:', socket.handshake.address);
  
  socket.on('join-video-room', (videoId) => {
    try {
      // Enhanced validation for videoId
      if (typeof videoId !== 'string' || videoId.length < 10 || videoId.length > 100) {
        socket.emit('error', { 
          message: 'Invalid video ID format',
          code: 'INVALID_VIDEO_ID'
        });
        return;
      }
      
      // Basic sanitization
      const sanitizedVideoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
      
      socket.join(sanitizedVideoId);
      console.log(`User ${socket.id} joined video room ${sanitizedVideoId}`);
      
      // Confirm room join with sanitized ID
      socket.emit('room-joined', { videoId: sanitizedVideoId });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { 
        message: 'Failed to join room',
        code: 'ROOM_JOIN_ERROR'
      });
    }
  });
  
  socket.on('leave-video-room', (videoId) => {
    try {
      if (typeof videoId === 'string' && videoId.length > 0) {
        socket.leave(videoId);
        console.log(`User ${socket.id} left video room ${videoId}`);
      }
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('Socket error for user', socket.id, ':', error);
  });
});

// Make io available in routes
app.set('socketio', io);

// Enhanced BullMQ queue events with error handling
const videoQueueEvents = new QueueEvents('video-processing', { 
  connection: redisClient 
});

videoQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
  try {
    const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
    const videoId = result?.videoId;
    
    if (videoId && typeof videoId === 'string') {
      io.to(videoId).emit('video-processed', { 
        videoId, 
        status: 'completed',
        transcript: result.transcript,
        summary: result.summary,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ Video processing completed: ${videoId}`);
    }
  } catch (e) {
    console.error('Error handling completed event:', e);
  }
});

videoQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  try {
    const job = await processVideoQueue.getJob(jobId);
    const videoId = job?.data?.videoId;
    
    if (videoId && typeof videoId === 'string') {
      io.to(videoId).emit('video-processed', { 
        videoId, 
        status: 'failed', 
        error: failedReason?.substring(0, 500) || 'Processing failed',
        timestamp: new Date().toISOString()
      });
      console.error(`❌ Video processing failed: ${videoId} - ${failedReason}`);
    }
  } catch (e) {
    console.error('Error handling failed event:', e);
  }
});

videoQueueEvents.on('error', (error) => {
  console.error('QueueEvents error:', error);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler with enhanced logging
app.use((error, req, res, next) => {
  const errorId = Math.random().toString(36).substring(2, 15);
  
  console.error('Global error handler:', {
    errorId,
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  // Handle specific error types
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ 
      error: 'Invalid JSON in request body',
      errorId 
    });
  }
  
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: 'Request entity too large',
      errorId 
    });
  }
  
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS policy violation',
      errorId 
    });
  }
  
  // Default error response
  const statusCode = error.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    errorId,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      details: error.details 
    })
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  server.close(() => {
    console.log('HTTP server closed');
    
    // Close Redis connection
    redisClient.quit();
    console.log('Redis connection closed');
    
    // Close MongoDB connection
    const mongoose = require('mongoose');
    mongoose.connection.close();
    console.log('MongoDB connection closed');
    
    console.log('Process terminated gracefully');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export { app, io };
export default server;