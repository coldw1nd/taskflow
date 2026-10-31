module.exports = function requestLogger(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      route,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2))
    }));
  });
  next();
};
