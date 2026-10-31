const { db } = require('../db');
const { ApiError, notFoundError } = require('../utils/errors');
const { writeAuditLog } = require('../utils/audit');

function listTags(userId) {
  return db.prepare(
    'SELECT id, name FROM tags WHERE user_id = ? ORDER BY name'
  ).all(userId);
}

const createTagTx = db.transaction(({ name, userId }) => {
  const info = db.prepare(
    'INSERT INTO tags(name, user_id) VALUES (?, ?)'
  ).run(name, userId);
  const id = Number(info.lastInsertRowid);
  writeAuditLog({
    userId,
    action: 'tag.created',
    entityType: 'tag',
    entityId: id,
    details: { name }
  });
  return { id, name };
});

function createTag(name, userId) {
  try {
    return createTagTx({ name, userId });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ApiError(409, 'TAG_EXISTS', 'Tag with this name already exists');
    }
    throw error;
  }
}

function deleteTag(tagId, userId) {
  const remove = db.transaction(() => {
    const info = db.prepare(
      'DELETE FROM tags WHERE id = ? AND user_id = ?'
    ).run(tagId, userId);
    if (info.changes === 0) return false;
    writeAuditLog({
      userId,
      action: 'tag.deleted',
      entityType: 'tag',
      entityId: tagId
    });
    return true;
  });

  if (!remove()) throw notFoundError();
}

module.exports = { listTags, createTag, deleteTag };
