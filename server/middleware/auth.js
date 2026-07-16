// Express authentication middleware and inactivity timeout management
const jwt = require('jsonwebtoken');
const Database = require('../database/db');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretssp_2026_jwt';

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

    // Attach user payload to the request
    req.user = decoded;

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

    // Update activity timestamp for next request
    req.user.lastActivity = Date.now();

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authMiddleware;
