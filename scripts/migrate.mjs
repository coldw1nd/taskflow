import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { db } = require('../src/db');

const rows = db.prepare(`
  SELECT m.version, m.applied_at, r.reverted_at
  FROM schema_migrations AS m
  LEFT JOIN schema_migration_reverts AS r ON r.version = m.version
  ORDER BY m.version
`).all();
console.log('История миграций:');
for (const row of rows) {
  const state = row.reverted_at ? `откачена ${row.reverted_at}` : `применена ${row.applied_at}`;
  console.log(`- ${row.version}: ${state}`);
}
db.close();
