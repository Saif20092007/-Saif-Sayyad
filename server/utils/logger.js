// Centralized application logging utility for separate app logs and audit logs

const fs = require('fs');
const path = require('path');
const Database = require('../database/db');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const appLogStream = fs.createWriteStream(path.join(logDir, 'app.log'), { flags: 'a' });

function logApp(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logObj = { timestamp, level, message, ...meta };
  const logStr = JSON.stringify(logObj) + '\n';
  appLogStream.write(logStr);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${level.toUpperCase()}] [${timestamp}] ${message}`, Object.keys(meta).length ? meta : '');
  }
}

// Separate debug logs from critical audit logs
const logger = {
  info: (msg, meta) => logApp('info', msg, meta),
  warn: (msg, meta) => logApp('warn', msg, meta),
  error: (msg, meta) => logApp('error', msg, meta),
  debug: (msg, meta) => logApp('debug', msg, meta),

  // Business audit logs recorded inside the persistent DB table
  audit: async (userId, action, moduleName, referenceId = null) => {
    try {
      const logData = {
        user_id: userId || null,
        action,
        module: moduleName,
        reference_id: referenceId ? String(referenceId) : null
      };
      await Database.query('audit_logs', 'insert', { data: logData });
      logApp('audit', `${action} in ${moduleName}`, { userId, referenceId });
    } catch (err) {
      logApp('error', `Failed to write audit log: ${err.message}`, { userId, action, moduleName });
    }
  }
};

module.exports = logger;
