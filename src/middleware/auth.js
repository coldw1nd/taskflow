const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorizedError } = require('../utils/errors');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(unauthorizedError());
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: Number(payload.sub),
      email: payload.email
    };
    next();
  } catch (error) {
    next(unauthorizedError('Invalid or expired token'));
  }
};