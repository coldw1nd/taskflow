const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const config = require('../config');
const { ApiError } = require('../utils/errors');

function toPublicUser(user) {
  return {
    id: Number(user.id),
    email: user.email,
    created_at: user.created_at
  };
}

async function registerUser(email, password) {
  const normalizedEmail = email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);

  if (existing) {
    throw new ApiError(409, 'EMAIL_EXISTS', 'User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();

  try {
    const info = db.prepare(
      'INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)'
    ).run(normalizedEmail, passwordHash, createdAt);

    return {
      id: Number(info.lastInsertRowid),
      email: normalizedEmail,
      created_at: createdAt
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ApiError(409, 'EMAIL_EXISTS', 'User with this email already exists');
    }
    throw error;
  }
}

async function authenticateUser(email, password) {
  const normalizedEmail = email.toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return { token, user: toPublicUser(user) };
}

function getCurrentUser(userId) {
  const user = db.prepare(
    'SELECT id, email, created_at FROM users WHERE id = ?'
  ).get(userId);

  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return user;
}

module.exports = { registerUser, authenticateUser, getCurrentUser };
