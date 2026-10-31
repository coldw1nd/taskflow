const { ApiError } = require('../utils/errors');

function createRateLimiter({ windowMs, max, message = 'Too many requests' }) {
  const requests = new Map();

  return function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();

    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = requests.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    bucket.count += 1;
    requests.set(key, bucket);

    if (requests.size > 5000) {
      for (const [address, value] of requests) {
        if (value.resetAt <= now) requests.delete(address);
      }
    }

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new ApiError(429, 'RATE_LIMITED', message));
    }
    return next();
  };
}

module.exports = { createRateLimiter };
