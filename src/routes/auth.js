const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const authService = require('../services/auth-service');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/register', asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await authService.registerUser(input.email, input.password);
  res.status(201).json(user);
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.authenticateUser(input.email, input.password);
  res.json(result);
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  res.json(authService.getCurrentUser(req.user.id));
}));

module.exports = router;
