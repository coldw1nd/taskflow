import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { db } = require('../src/db');

function main() {
  const integrity = db.pragma('integrity_check');
  const foreignKeyErrors = db.pragma('foreign_key_check');
  const migrations = db.prepare(
    'SELECT version FROM schema_migrations ORDER BY version'
  ).all();
  const indexes = db.prepare(`
    SELECT name, tbl_name FROM sqlite_master
    WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    ORDER BY tbl_name, name
  `).all();
  const queryPlan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT id, title, status, created_at
    FROM tasks WHERE user_id = ?
    ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(1, 10);

  console.log(JSON.stringify({
    integrity,
    foreignKeyErrors,
    migrations,
    indexes,
    queryPlan
  }, null, 2));

  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
    throw new Error('SQLite integrity_check reported an error');
  }
  if (foreignKeyErrors.length > 0) {
    throw new Error('SQLite foreign_key_check reported an error');
  }
}

try {
  main();
} catch (error) {
  console.error('Проверка БД завершилась с ошибкой:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
