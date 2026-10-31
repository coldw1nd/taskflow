const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbFile =
  process.env.DB_FILE === ':memory:'
    ? ':memory:'
    : path.resolve(__dirname, '..', process.env.DB_FILE || 'taskflow.sqlite');

const db = new Database(dbFile);
db.pragma('foreign_keys = ON');

if (dbFile !== ':memory:') {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
}

function applyMigrations(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migration_reverts (
      version TEXT PRIMARY KEY,
      reverted_at TEXT NOT NULL,
      FOREIGN KEY(version) REFERENCES schema_migrations(version) ON DELETE CASCADE
    );
  `);

  const migrationsDirectory = path.join(__dirname, '..', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();

  const isApplied = database.prepare(
    'SELECT 1 FROM schema_migrations WHERE version = ?'
  );
  const isReverted = database.prepare(
    'SELECT 1 FROM schema_migration_reverts WHERE version = ?'
  );
  const markApplied = database.prepare(
    'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)'
  );

  for (const file of migrationFiles) {
    if (isApplied.get(file) || isReverted.get(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
    database.transaction(() => {
      database.exec(sql);
      markApplied.run(file, new Date().toISOString());
    })();
  }
}

applyMigrations(db);

module.exports = { db, applyMigrations };
