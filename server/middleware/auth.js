// Express authentication middleware and inactivity timeout management
const jwt = require('jsonwebtoken');
const Database = require('../database/db');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}

async function authMiddleware(req, reqRes, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Access denied. No token provided.');
      err.status = 401;
      return next(err);
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      const err = new Error('Invalid or expired authentication token.');
      err.status = 401;
      return next(err);
    }

    // Cached inactivity timeout to prevent query overhead on every single API request
    if (!global.cachedInactivityTimeoutMs || (global.lastCacheTime && (Date.now() - global.lastCacheTime > 60000))) {
      try {
        const settingsList = await Database.query('settings', 'select');
        const settings = settingsList && settingsList.length > 0 ? settingsList[0] : { inactivity_timeout_minutes: 60 };
        global.cachedInactivityTimeoutMs = settings.inactivity_timeout_minutes * 60 * 1000;
        global.lastCacheTime = Date.now();
      } catch (err) {
        global.cachedInactivityTimeoutMs = 60 * 60 * 1000; // 60 minutes fallback
      }
    }

    const timeoutMs = global.cachedInactivityTimeoutMs || (60 * 60 * 1000);

    if (decoded.lastActivity) {
      const timeSinceLastActivity = Date.now() - decoded.lastActivity;
      if (timeSinceLastActivity > timeoutMs) {
        const err = new Error('Session inactive for too long. Please login again.');
        err.status = 401;
        return next(err);
      }
    }

    // Attach user payload to the request
    req.user = decoded;

    // Issue refreshed token on each authenticated request
    const refreshedToken = jwt.sign(
      { id: decoded.id, email: decoded.email, lastActivity: Date.now(), mustChangePassword: !!decoded.mustChangePassword },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Expose header & set refresh token
    reqRes.setHeader('Access-Control-Expose-Headers', 'X-Refresh-Token');
    reqRes.setHeader('X-Refresh-Token', refreshedToken);

    next();
  } catch (error) {
    next(error);
  }
}

// Server-side enforcement middleware for forced password updates
async function mustChangePasswordMiddleware(req, reqRes, next) {
  try {
    if (req.user && req.user.mustChangePassword) {
      const err = new Error('Action Required: You must change your temporary password before accessing other modules.');
      err.status = 403;
      return next(err);
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authMiddleware;
module.exports.authMiddleware = authMiddleware;
module.exports.mustChangePasswordMiddleware = mustChangePasswordMiddleware;
