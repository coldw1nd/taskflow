const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production');
}

module.exports = {
  jwtSecret: jwtSecret || 'taskflow-local-development-secret-not-for-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || ''
};
