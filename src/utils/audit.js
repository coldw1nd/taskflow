const { db } = require('../db');

const insertAuditLog = db.prepare(`
  INSERT INTO audit_logs(user_id, action, entity_type, entity_id, created_at, details_json)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function writeAuditLog({ userId, action, entityType, entityId, details = {} }) {
  insertAuditLog.run(
    userId ?? null,
    action,
    entityType,
    entityId ?? null,
    new Date().toISOString(),
    JSON.stringify(details)
  );
}

module.exports = { writeAuditLog };
