const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db').db;
const config = require('../config');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const { ApiError } = require('../utils/errors');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn
    }
  );
}

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    created_at: row.created_at
  };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password } = registerSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const existingUser = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(normalizedEmail);

    if (existingUser) {
      throw new ApiError(
        409,
        'EMAIL_EXISTS',
        'User with this email already exists'
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    const info = db
      .prepare(
        'INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)'
      )
      .run(normalizedEmail, passwordHash, createdAt);

    res.status(201).json({
      id: Number(info.lastInsertRowid),
      email: normalizedEmail,
      created_at: createdAt
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(normalizedEmail);

    if (!user) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const token = signToken(user);

    res.json({
      token,
      user: toPublicUser(user)
    });
  })
);

router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    const user = db
      .prepare('SELECT id, email, created_at FROM users WHERE id = ?')
      .get(req.user.id);

    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }

    res.json(user);
  })
);

module.exports = router;