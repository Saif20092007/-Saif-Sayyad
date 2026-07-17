// Centralized Express Global Error Handling Middleware with sensitive data redaction
const logger = require('../utils/logger');

// Deep clone and redact sensitive properties from payload logs
function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  const cloned = Array.isArray(obj) ? [...obj] : { ...obj };
  const sensitiveKeys = ['password', 'oldpassword', 'newpassword', 'token', 'authorization', 'secret'];

  for (const key of Object.keys(cloned)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      cloned[key] = '[REDACTED]';
    } else if (typeof cloned[key] === 'object') {
      cloned[key] = redactSensitiveData(cloned[key]);
    }
  }
  return cloned;
}

function errorHandler(err, req, reqRes, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  const redactedBody = redactSensitiveData(req.body);
  const redactedHeaders = redactSensitiveData(req.headers);

  logger.error(message, {
    status,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: redactedBody,
    headers: redactedHeaders
  });

  reqRes.status(status).json({
    success: false,
    error: {
      status,
      message
    }
  });
}

module.exports = errorHandler;
