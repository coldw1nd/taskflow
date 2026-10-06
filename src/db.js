const Database = require('better-sqlite3');
const path = require('path');

const dbFile =
  process.env.DB_FILE === ':memory:'
    ? ':memory:'
    : path.join(__dirname, '..', process.env.DB_FILE || 'taskflow.sqlite');

const db = new Database(dbFile);

db.pragma('foreign_keys = ON');

if (dbFile !== ':memory:') {
  db.pragma('journal_mode = WAL');
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK(length(title) > 0 AND length(title) <= 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
  deadline TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  user_id INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(deadline IS NULL OR deadline >= created_at)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) > 0 AND length(name) <= 50),
  user_id INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(name, user_id)
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY(task_id, tag_id),
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
`);

module.exports = { db };