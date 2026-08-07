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

// Fail loudly in production if PUBLIC_APP_URL is missing or empty
if (process.env.NODE_ENV === 'production') {
  if (!process.env.PUBLIC_APP_URL || process.env.PUBLIC_APP_URL.trim() === '') {
    console.error('\n==================================================================');
    console.error('FATAL: PUBLIC_APP_URL is missing from production environment variables.');
    console.error('For safety, QR code verification links must be generated with a valid public domain.');
    console.error('Please define PUBLIC_APP_URL in your environment (e.g., https://yourdomain.com)');
    console.error('==================================================================\n');
    process.exit(1);
  }
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

const authMiddleware = require('./middleware/auth');
const { mustChangePasswordMiddleware } = authMiddleware;

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', authMiddleware, mustChangePasswordMiddleware, require('./routes/customers'));
app.use('/api/suppliers', authMiddleware, mustChangePasswordMiddleware, require('./routes/suppliers'));
app.use('/api/products', authMiddleware, mustChangePasswordMiddleware, require('./routes/products'));
app.use('/api/company-profile', authMiddleware, mustChangePasswordMiddleware, require('./routes/companyProfile'));
app.use('/api/settings', authMiddleware, mustChangePasswordMiddleware, require('./routes/settings'));
app.use('/api/invoices', authMiddleware, mustChangePasswordMiddleware, require('./routes/invoices'));
app.use('/api/purchases', authMiddleware, mustChangePasswordMiddleware, require('./routes/purchases'));
app.use('/api/payments', authMiddleware, mustChangePasswordMiddleware, require('./routes/payments'));
app.use('/api/ledger', authMiddleware, mustChangePasswordMiddleware, require('./routes/ledger'));
app.use('/api/reports', authMiddleware, mustChangePasswordMiddleware, require('./routes/reports'));
app.use('/api/verify', require('./routes/verify')); // Public route

// Static Storage and Client Files serving
app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use(express.static(path.join(__dirname, '../client')));

// Route for public read-only invoice verification page
app.get('/verify/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/verify/index.html'));
});

// Fallback all other routes to client dashboard dashboard UI (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Centralized error handling middleware
app.use(errorHandler);

// Initialize background auto backup scheduler
const backupService = require('./services/backupService');
backupService.startAutoBackupScheduler();

app.listen(PORT, () => {
  logger.info(`SS Plastotech ERP Server running on port ${PORT}`);
});
