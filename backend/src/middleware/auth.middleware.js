import { verifyToken } from '@clerk/backend';

// Rate limiting for auth attempts
const authAttempts = new Map();
const MAX_AUTH_ATTEMPTS = 10;
const AUTH_WINDOW = 15 * 60 * 1000;

const cleanupAuthAttempts = () => {
  const now = Date.now();
  for (const [ip, data] of authAttempts.entries()) {
    if (now - data.firstAttempt > AUTH_WINDOW) {
      authAttempts.delete(ip);
    }
  }
};

setInterval(cleanupAuthAttempts, 5 * 60 * 1000);

const auth = async (req, res, next) => {
  // Development mode bypass
  if (process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS_DEV === 'true') {
    console.warn('⚠️ Authentication bypassed in development mode via AUTH_BYPASS_DEV.');
    req.user = {
      id: 'user_dev_mock_12345',
      email: 'dev@example.com',
      username: 'devuser',
      sessionId: 'sess_dev_mock_67890',
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    };
    return next();
  }

  try {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check rate limiting
    const now = Date.now();
    const attempts = authAttempts.get(clientIP);
    
    if (attempts) {
      if (now - attempts.firstAttempt < AUTH_WINDOW && attempts.count >= MAX_AUTH_ATTEMPTS) {
        return res.status(429).json({ 
          message: 'Too many authentication attempts. Please try again later.',
          retryAfter: Math.ceil((AUTH_WINDOW - (now - attempts.firstAttempt)) / 1000)
        });
      }
      
      if (now - attempts.firstAttempt >= AUTH_WINDOW) {
        authAttempts.delete(clientIP);
      }
    }
    
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. No authorization header provided.',
        code: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid authorization format.',
        code: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }
    
    if (token.length < 10 || token.length > 2000) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }
    
    // Verify token with Clerk
    let decoded;
    try {
      decoded = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
    } catch (verifyError) {
      recordFailedAttempt(clientIP);
      console.error('Token verification failed:', {
        error: verifyError.message,
        ip: clientIP,
        timestamp: new Date().toISOString()
      });
      
      if (verifyError.message.includes('expired')) {
        return res.status(401).json({ 
          message: 'Access denied. Token has expired.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (verifyError.message.includes('invalid')) {
        return res.status(401).json({ 
          message: 'Access denied. Invalid token.',
          code: 'INVALID_TOKEN'
        });
      }
      
      return res.status(401).json({ 
        message: 'Access denied. Token verification failed.',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }
    
    if (!decoded || !decoded.sub) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid token payload.',
        code: 'INVALID_TOKEN_PAYLOAD'
      });
    }
    
    if (typeof decoded.sub !== 'string' || decoded.sub.length < 5) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({ 
        message: 'Access denied. Invalid user ID in token.',
        code: 'INVALID_USER_ID'
      });
    }
    
    // Set user information on request
    req.user = {
      id: decoded.sub,
      email: decoded.email || null,
      username: decoded.username || decoded.email || 'Unknown',
      sessionId: decoded.sid || null,
      issuedAt: decoded.iat || null,
      expiresAt: decoded.exp || null
    };
    
    // Clear failed attempts on successful auth
    authAttempts.delete(clientIP);
    
    next();
  } catch (error) {
    console.error('Authentication middleware error:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      message: 'Internal server error during authentication.',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
};

const recordFailedAttempt = (clientIP) => {
  const now = Date.now();
  const attempts = authAttempts.get(clientIP);
  
  if (attempts) {
    attempts.count += 1;
    attempts.lastAttempt = now;
  } else {
    authAttempts.set(clientIP, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    });
  }
};

export default auth;