require('dotenv').config();

const { app } = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`TaskFlow started: http://localhost:${config.port}`);
});