process.env.DB_FILE = ':memory:';
process.env.JWT_SECRET = 'database-test-secret';

const Database = require('better-sqlite3');
const { db: moduleDb, applyMigrations } = require('../src/db');

const testDb = new Database(':memory:');
testDb.pragma('foreign_keys = ON');
applyMigrations(testDb);

let userId;

describe('SQLite schema and integrity', () => {
  beforeAll(() => {
    const user = testDb.prepare(
      'INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)'
    ).run('db-test@example.com', 'not-a-real-hash', '2026-01-01T00:00:00.000Z');
    userId = Number(user.lastInsertRowid);
  });

  test('all versioned migrations are registered', () => {
    const rows = testDb.prepare(
      'SELECT version FROM schema_migrations ORDER BY version'
    ).all();
    expect(rows.map((row) => row.version)).toEqual([
      '001_core.sql',
      '002_audit_log.sql',
      '003_query_indexes.sql'
    ]);
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM schema_migration_reverts').get().count).toBe(0);
  });

  test('required query indexes exist', () => {
    const names = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index'"
    ).all().map((row) => row.name);
    expect(names).toContain('idx_tasks_user_created_id');
    expect(names).toContain('idx_tasks_user_status_created_id');
    expect(names).toContain('idx_task_tags_tag_task');
  });

  test('NOT NULL and CHECK rules reject an empty task title', () => {
    expect(() => testDb.prepare(`
      INSERT INTO tasks(title, status, created_at, user_id)
      VALUES ('', 'active', '2026-01-01T00:00:00.000Z', ?)
    `).run(userId)).toThrow();
  });

  test('CHECK constraint rejects an unsupported task status', () => {
    expect(() => testDb.prepare(`
      INSERT INTO tasks(title, status, created_at, user_id)
      VALUES ('Тест', 'paused', '2026-01-01T00:00:00.000Z', ?)
    `).run(userId)).toThrow();
  });

  test('UNIQUE constraint protects user email', () => {
    expect(() => testDb.prepare(
      'INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)'
    ).run('db-test@example.com', 'hash', '2026-01-01T00:00:00.000Z')).toThrow();
  });

  test('foreign key rejects task with unknown owner', () => {
    expect(() => testDb.prepare(`
      INSERT INTO tasks(title, status, created_at, user_id)
      VALUES ('Без владельца', 'active', '2026-01-01T00:00:00.000Z', 999999)
    `).run()).toThrow();
  });

  test('deadline cannot precede task creation time', () => {
    expect(() => testDb.prepare(`
      INSERT INTO tasks(title, status, deadline, created_at, user_id)
      VALUES ('Некорректный срок', 'active', '2025-12-31T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ?)
    `).run(userId)).toThrow();
  });

  test('foreign-key cascade removes dependent task-tag rows', () => {
    const tag = testDb.prepare(
      'INSERT INTO tags(name, user_id) VALUES (?, ?)'
    ).run('Дом', userId);
    const task = testDb.prepare(`
      INSERT INTO tasks(title, status, created_at, user_id)
      VALUES ('Каскад', 'active', '2026-01-01T00:00:00.000Z', ?)
    `).run(userId);
    testDb.prepare('INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)')
      .run(Number(task.lastInsertRowid), Number(tag.lastInsertRowid));

    testDb.prepare('DELETE FROM tasks WHERE id = ?').run(Number(task.lastInsertRowid));
    const remaining = testDb.prepare(
      'SELECT COUNT(*) AS count FROM task_tags WHERE task_id = ?'
    ).get(Number(task.lastInsertRowid));
    expect(Number(remaining.count)).toBe(0);
  });

  test('integrity and foreign-key checks pass for the test database', () => {
    expect(testDb.pragma('integrity_check')[0].integrity_check).toBe('ok');
    expect(testDb.pragma('foreign_key_check')).toHaveLength(0);
  });
});

afterAll(() => {
  testDb.close();
  moduleDb.close();
});
