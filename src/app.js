const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { db } = require('./db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const tagRoutes = require('./routes/tags');
const { notFoundError, errorHandler } = require('./utils/errors');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tags', tagRoutes);

app.use('/api', (req, res, next) => {
  next(notFoundError());
});

app.use(errorHandler);

module.exports = { app, db };