import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
require('dotenv').config();
const Database = require('better-sqlite3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DB_FILE === ':memory:'
  ? ':memory:'
  : path.resolve(process.env.DB_FILE || 'taskflow.sqlite');
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');

function main() {
  const version = process.argv[2];
  if (!version || !/^\d+_[a-z0-9_-]+\.sql$/i.test(version)) {
    throw new Error('Укажите версию: npm run db:rollback -- 003_query_indexes.sql');
  }
  if (version.startsWith('001_') && process.env.CONFIRM_DESTRUCTIVE_ROLLBACK !== 'yes') {
    throw new Error('Откат 001 удаляет пользовательские данные. Сначала вручную скопируйте файл SQLite и задайте CONFIRM_DESTRUCTIVE_ROLLBACK=yes.');
  }

  const rollbackFile = path.join(__dirname, '..', 'migrations', 'rollback', version.replace(/\.sql$/i, '.down.sql'));
  if (!fs.existsSync(rollbackFile)) throw new Error(`Файл отката не найден: ${rollbackFile}`);

  const applied = db.prepare(
    'SELECT 1 FROM schema_migrations WHERE version = ?'
  ).get(version);
  if (!applied) throw new Error(`Миграция ${version} не отмечена как применённая`);

  const alreadyReverted = db.prepare(
    'SELECT 1 FROM schema_migration_reverts WHERE version = ?'
  ).get(version);
  if (alreadyReverted) throw new Error(`Миграция ${version} уже откачена`);

  const sql = fs.readFileSync(rollbackFile, 'utf8');
  db.transaction(() => {
    db.exec(sql);
    db.prepare(`
      INSERT INTO schema_migration_reverts(version, reverted_at)
      VALUES (?, ?)
    `).run(version, new Date().toISOString());
  })();
  console.log(`Откат выполнен: ${version}. История применения сохранена.`);
}

try {
  main();
} catch (error) {
  console.error('Не удалось выполнить откат:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
