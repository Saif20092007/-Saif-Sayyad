// Authentication and Owner Management Controllers
const jwt = require('jsonwebtoken');
const Database = require('../database/db');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretssp_2026_jwt';

// Helper to check standard MD5/plain fallback since bcrypt is optional and we want high local reliability
function simpleHash(password) {
  return require('crypto').createHash('sha256').update(password).digest('hex');
}

exports.login = async (req, reqRes, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      const err = new Error('Email and password are required.');
      err.status = 400;
      return next(err);
    }

    const users = await Database.query('users', 'select', { filters: { email } });
    if (!users || users.length === 0) {
      // In a fresh setup, if no users exist, we create the default owner account
      const allUsers = await Database.query('users', 'select');
      if (!allUsers || allUsers.length === 0) {
        const defaultOwner = {
          email: 'owner@ssplastotech.com',
          password_hash: simpleHash('Admin@123')
        };
        const created = await Database.query('users', 'insert', { data: defaultOwner });
        if (email === created.email && simpleHash(password) === created.password_hash) {
          const token = jwt.sign({ id: created.id, email: created.email, lastActivity: Date.now() }, JWT_SECRET, { expiresIn: '8h' });
          await Database.query('users', 'update', { id: created.id, data: { last_login: new Date().toISOString() } });
          await logger.audit(created.id, 'User Login (Initial Seed)', 'auth', created.id);
          return reqRes.json({ success: true, token, user: { id: created.id, email: created.email } });
        }
      }
      const err = new Error('Invalid email or password.');
      err.status = 401;
      return next(err);
    }

    const user = users[0];
    const incomingHash = simpleHash(password);

    if (user.password_hash !== incomingHash) {
      const err = new Error('Invalid email or password.');
      err.status = 401;
      return next(err);
    }

    const token = jwt.sign({ id: user.id, email: user.email, lastActivity: Date.now() }, JWT_SECRET, { expiresIn: '8h' });
    await Database.query('users', 'update', { id: user.id, data: { last_login: new Date().toISOString() } });
    await logger.audit(user.id, 'User Login', 'auth', user.id);

    reqRes.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, reqRes, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      const err = new Error('Old password and new password are required.');
      err.status = 400;
      return next(err);
    }

    const user = await Database.query('users', 'select', { id: userId });
    if (!user) {
      const err = new Error('User not found.');
      err.status = 404;
      return next(err);
    }

    const incomingHash = simpleHash(oldPassword);
    if (user.password_hash !== incomingHash) {
      const err = new Error('Incorrect current password.');
      err.status = 400;
      return next(err);
    }

    const newHash = simpleHash(newPassword);
    await Database.query('users', 'update', { id: userId, data: { password_hash: newHash } });
    await logger.audit(userId, 'Change Password', 'auth', userId);

    reqRes.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, reqRes, next) => {
  try {
    if (req.user) {
      await logger.audit(req.user.id, 'User Logout', 'auth', req.user.id);
    }
    reqRes.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    next(error);
  }
};
