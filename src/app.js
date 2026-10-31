const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { db } = require('./db');
const config = require('./config');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const tagRoutes = require('./routes/tags');
const { notFoundError, errorHandler } = require('./utils/errors');
const { createRateLimiter } = require('./middleware/rate-limit');
const requestLogger = require('./middleware/request-logger');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigin || false }));
app.use(express.json({ limit: '32kb' }));
app.use(requestLogger);

const apiRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300 });
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Try again later.'
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/docs', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'api-docs.html'));
});

app.get('/openapi.yaml', (req, res) => {
  res.type('text/yaml').sendFile(path.join(__dirname, '..', 'openapi.yaml'));
});

app.get('/api/health', (req, res, next) => {
  try {
    db.prepare('SELECT 1 AS result').get();
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use('/api', apiRateLimiter);
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tags', tagRoutes);

app.use('/api', (req, res, next) => next(notFoundError()));
app.use(errorHandler);

module.exports = { app, db };
