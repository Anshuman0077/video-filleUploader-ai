import { verifyToken } from '@clerk/backend';

// Enhanced rate limiting with TTL and memory management
class RateLimiter {
  constructor(windowMs = 15 * 60 * 1000, maxAttempts = 10) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.attempts = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // Cleanup every 5 minutes
  }

  recordAttempt(identifier) {
    const now = Date.now();
    const attemptData = this.attempts.get(identifier) || { count: 0, firstAttempt: now };
    
    attemptData.count += 1;
    attemptData.lastAttempt = now;
    
    this.attempts.set(identifier, attemptData);
    return attemptData;
  }

  isRateLimited(identifier) {
    const attemptData = this.attempts.get(identifier);
    if (!attemptData) return false;

    const now = Date.now();
    if (now - attemptData.firstAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return false;
    }

    return attemptData.count >= this.maxAttempts;
  }

  getRemainingTime(identifier) {
    const attemptData = this.attempts.get(identifier);
    if (!attemptData) return 0;

    const now = Date.now();
    const elapsed = now - attemptData.firstAttempt;
    return Math.max(0, this.windowMs - elapsed);
  }

  cleanup() {
    const now = Date.now();
    for (const [identifier, data] of this.attempts.entries()) {
      if (now - data.firstAttempt > this.windowMs) {
        this.attempts.delete(identifier);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.attempts.clear();
  }
}

// Create rate limiters for different scenarios
const ipRateLimiter = new RateLimiter(15 * 60 * 1000, 10); // 10 attempts per 15 minutes per IP
const userIdRateLimiter = new RateLimiter(15 * 60 * 1000, 20); // 20 attempts per 15 minutes per user

// Cleanup on process exit
process.on('SIGTERM', () => {
  ipRateLimiter.destroy();
  userIdRateLimiter.destroy();
});

process.on('SIGINT', () => {
  ipRateLimiter.destroy();
  userIdRateLimiter.destroy();
});

const auth = async (req, res, next) => {
  // Development mode bypass with enhanced security
  if (process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS_DEV === 'true') {
    console.warn('⚠️ Authentication bypassed in development mode via AUTH_BYPASS_DEV.');
    
    // Validate that we're not in production
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ AUTH_BYPASS_DEV should never be used in production!');
      return res.status(500).json({ 
        message: 'Configuration error: AUTH_BYPASS_DEV enabled in production',
        code: 'CONFIG_ERROR'
      });
    }

    req.user = {
      id: 'user_dev_mock_' + Math.random().toString(36).substring(2, 15),
      email: 'dev@example.com',
      username: 'devuser',
      sessionId: 'sess_dev_mock_' + Math.random().toString(36).substring(2, 15),
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    };
    return next();
  }

  try {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Enhanced IP-based rate limiting
    if (ipRateLimiter.isRateLimited(clientIP)) {
      const remainingTime = ipRateLimiter.getRemainingTime(clientIP);
      return res.status(429).json({ 
        message: 'Too many authentication attempts. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(remainingTime / 1000)
      });
    }
    
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. No authorization header provided.',
        code: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid authorization format. Expected "Bearer <token>"',
        code: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }
    
    // Enhanced token validation
    if (token.length < 10 || token.length > 5000) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Basic token structure validation (JWT has 3 parts separated by dots)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Malformed token structure.',
        code: 'MALFORMED_TOKEN'
      });
    }
    
    // Verify token with Clerk with enhanced error handling
    let decoded;
    try {
      decoded = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        // Additional security options
        issuer: 'https://clerk.yourdomain.com', // Adjust based on your Clerk instance
        clockTolerance: 5, // 5 seconds tolerance for clock skew
      });
    } catch (verifyError) {
      ipRateLimiter.recordAttempt(clientIP);
      
      // Enhanced error logging with security context
      console.error('Token verification failed:', {
        error: verifyError.message,
        errorType: verifyError.name,
        ip: clientIP,
        tokenLength: token.length,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent')
      });
      
      // Categorized error responses
      if (verifyError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          message: 'Access denied. Token has expired.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (verifyError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          message: 'Access denied. Invalid token signature.',
          code: 'INVALID_TOKEN_SIGNATURE'
        });
      }
      
      if (verifyError.name === 'NotBeforeError') {
        return res.status(401).json({ 
          message: 'Access denied. Token not yet valid.',
          code: 'TOKEN_NOT_ACTIVE'
        });
      }
      
      return res.status(401).json({ 
        message: 'Access denied. Token verification failed.',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }
    
    // Enhanced payload validation
    if (!decoded || typeof decoded !== 'object') {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid token payload.',
        code: 'INVALID_TOKEN_PAYLOAD'
      });
    }
    
    if (!decoded.sub || typeof decoded.sub !== 'string' || decoded.sub.length < 5) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid user ID in token.',
        code: 'INVALID_USER_ID'
      });
    }

    // Validate token timestamps
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Token has expired.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (decoded.nbf && decoded.nbf > now) {
      ipRateLimiter.recordAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Token not yet valid.',
        code: 'TOKEN_NOT_ACTIVE'
      });
    }
    
    // Set user information on request with enhanced validation
    req.user = {
      id: decoded.sub,
      email: decoded.email && typeof decoded.email === 'string' ? decoded.email : null,
      username: (decoded.username && typeof decoded.username === 'string') 
        ? decoded.username 
        : (decoded.email && typeof decoded.email === 'string' ? decoded.email.split('@')[0] : 'Unknown'),
      sessionId: decoded.sid && typeof decoded.sid === 'string' ? decoded.sid : null,
      issuedAt: decoded.iat && typeof decoded.iat === 'number' ? decoded.iat : null,
      expiresAt: decoded.exp && typeof decoded.exp === 'number' ? decoded.exp : null,
      roles: decoded.roles && Array.isArray(decoded.roles) ? decoded.roles : [],
      permissions: decoded.permissions && Array.isArray(decoded.permissions) ? decoded.permissions : []
    };

    // Additional user-based rate limiting
    if (userIdRateLimiter.isRateLimited(req.user.id)) {
      const remainingTime = userIdRateLimiter.getRemainingTime(req.user.id);
      return res.status(429).json({ 
        message: 'Too many requests from this account. Please try again later.',
        code: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(remainingTime / 1000)
      });
    }

    // Clear failed attempts on successful auth
    ipRateLimiter.attempts.delete(clientIP);
    
    // Log successful authentication for security monitoring
    console.log('Successful authentication:', {
      userId: req.user.id,
      ip: clientIP,
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent')
    });
    
    next();
  } catch (error) {
    // Enhanced error handling with security context
    console.error('Authentication middleware error:', {
      error: error.message,
      errorType: error.name,
      stack: error.stack,
      ip: req.ip || 'unknown',
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent')
    });
    
    res.status(500).json({ 
      message: 'Internal server error during authentication.',
      code: 'AUTH_INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
};

// Export rate limiters for potential external use
export { ipRateLimiter, userIdRateLimiter };

export default auth;