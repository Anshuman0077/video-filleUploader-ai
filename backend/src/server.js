import './config/env.js';
import server, { app } from './app.js';

const PORT = process.env.PORT || 5000;

// Enhanced server startup with validation
const startServer = async () => {
  try {
    // Validate critical environment variables
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    
    if (!process.env.CLERK_SECRET_KEY) {
      console.warn('⚠️ CLERK_SECRET_KEY is missing. Authentication will not work properly.');
    }
    
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY is missing. AI features will be limited.');
    }

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`📈 Node.js version: ${process.version}`);
      console.log(`🕒 Started at: ${new Date().toISOString()}`);
      
      // Log important configuration
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode enabled');
        console.log('📋 Configuration:');
        console.log(`   - Worker concurrency: ${process.env.WORKER_CONCURRENCY || 1}`);
        console.log(`   - Max file size: ${process.env.MAX_FILE_SIZE || '500MB'}`);
        console.log(`   - Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
      }
    });

    // Enhanced error handling for server
    server.on('error', (error) => {
      console.error('❌ Server error:', {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
      
      if (error.code === 'EADDRINUSE') {
        console.error(`💥 Port ${PORT} is already in use. Please use a different port.`);
        process.exit(1);
      }
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      
      server.close((err) => {
        if (err) {
          console.error('❌ Error during shutdown:', err);
          process.exit(1);
        }
        
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('💥 Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  console.error('💥 Critical error during server startup:', error);
  process.exit(1);
});

export default server;