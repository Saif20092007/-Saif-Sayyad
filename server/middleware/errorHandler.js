// Centralized Express Global Error Handling Middleware
const logger = require('../utils/logger');

function errorHandler(err, req, reqRes, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(message, {
    status,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body
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
