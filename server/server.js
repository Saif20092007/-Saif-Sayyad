// Express Server Entry Point for SS Plastotech ERP
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Crash server on startup if JWT_SECRET is missing or empty
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('\n==================================================================');
  console.error('FATAL: JWT_SECRET is missing from the environment configuration.');
  console.error('For safety, server cannot start without a secure JWT_SECRET defined.');
  console.error('Please generate a secure, random string and set it in your .env');
  console.error('==================================================================\n');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support larger base64 for logo/signatures

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/products', require('./routes/products'));
app.use('/api/company-profile', require('./routes/companyProfile'));
app.use('/api/settings', require('./routes/settings'));

// Static Client Files serving
app.use(express.static(path.join(__dirname, '../client')));

// Fallback all other routes to client dashboard dashboard UI (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Centralized error handling middleware
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`SS Plastotech ERP Server running on port ${PORT}`);
});
