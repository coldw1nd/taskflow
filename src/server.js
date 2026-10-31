require('dotenv').config();

const { app } = require('./app');
const config = require('./config');

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`TaskFlow is running on http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server...`);
  server.close(() => {
    const { db } = require('./db');
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
