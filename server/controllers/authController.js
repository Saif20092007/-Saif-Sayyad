// Authentication and Owner Management Controllers with Bcrypt hashing
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Database = require('../database/db');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}

const SALT_ROUNDS = 10;

exports.login = async (req, reqRes, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      const err = new Error('Email and password are required.');
      err.status = 400;
      return next(err);
    }

    let users = [];
    try {
      users = await Database.query('users', 'select', { filters: { email } });
    } catch (e) {
      // If table is empty or connection not fully configured, fallback to standard seeding check
    }

    if (!users || users.length === 0) {
      // In a fresh setup, if no users exist, we check if we should create the default owner account
      let allUsers = [];
      try {
        allUsers = await Database.query('users', 'select');
      } catch (e) {}

      if (!allUsers || allUsers.length === 0) {
        const hashedPassword = await bcrypt.hash('Admin@123', SALT_ROUNDS);
        const defaultOwner = {
          email: 'owner@ssplastotech.com',
          password_hash: hashedPassword
        };
        const created = await Database.query('users', 'insert', { data: defaultOwner });
        if (email === created.email && password === 'Admin@123') {
          const token = jwt.sign(
            { id: created.id, email: created.email, lastActivity: Date.now(), mustChangePassword: true },
            JWT_SECRET,
            { expiresIn: '8h' }
          );
          await Database.query('users', 'update', { id: created.id, data: { last_login: new Date().toISOString() } });
          await logger.audit(created.id, 'User Login (Initial Seed)', 'auth', created.id);
          return reqRes.json({
            success: true,
            token,
            user: { id: created.id, email: created.email },
            must_change_password: true
          });
        }
      }
      const err = new Error('Invalid email or password.');
      err.status = 401;
      return next(err);
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      const err = new Error('Invalid email or password.');
      err.status = 401;
      return next(err);
    }

    // Force a password change if they are logging in with the default password
    const isUsingDefaultPassword = password === 'Admin@123';

    const token = jwt.sign(
      { id: user.id, email: user.email, lastActivity: Date.now(), mustChangePassword: isUsingDefaultPassword },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    await Database.query('users', 'update', { id: user.id, data: { last_login: new Date().toISOString() } });
    await logger.audit(user.id, 'User Login', 'auth', user.id);

    reqRes.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email
      },
      must_change_password: isUsingDefaultPassword
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

    const passwordMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!passwordMatch) {
      const err = new Error('Incorrect current password.');
      err.status = 400;
      return next(err);
    }

    if (newPassword === 'Admin@123') {
      const err = new Error('Cannot change password to the default insecure value.');
      err.status = 400;
      return next(err);
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await Database.query('users', 'update', { id: userId, data: { password_hash: hashedPassword } });
    await logger.audit(userId, 'Change Password', 'auth', userId);

    // Generate fresh JWT token with mustChangePassword: false
    const token = jwt.sign(
      { id: user.id, email: user.email, lastActivity: Date.now(), mustChangePassword: false },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    reqRes.json({
      success: true,
      message: 'Password updated successfully.',
      token
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
