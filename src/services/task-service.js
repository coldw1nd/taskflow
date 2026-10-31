const { db } = require('../db');
const { ApiError, notFoundError } = require('../utils/errors');
const { writeAuditLog } = require('../utils/audit');

function normalizeDeadline(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Deadline must be a valid date');
  }
  return date.toISOString();
}

function verifyTagsOwnership(tagIds, userId) {
  const uniqueIds = [...new Set(tagIds)];
  if (uniqueIds.length === 0) return;

  const placeholders = uniqueIds.map(() => '?').join(',');
  const result = db.prepare(
    `SELECT COUNT(*) AS count FROM tags WHERE user_id = ? AND id IN (${placeholders})`
  ).get(userId, ...uniqueIds);

  if (Number(result.count) !== uniqueIds.length) {
    throw new ApiError(400, 'TAG_NOT_FOUND', 'One or more tags do not exist');
  }
}

function replaceTaskTags(taskId, tagIds, userId) {
  const uniqueIds = [...new Set(tagIds)];
  verifyTagsOwnership(uniqueIds, userId);
  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);

  const insert = db.prepare('INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)');
  for (const tagId of uniqueIds) insert.run(taskId, tagId);
}

function getTaskById(taskId, userId) {
  const task = db.prepare(
    'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
  ).get(taskId, userId);
  if (!task) return null;

  const tags = db.prepare(`
    SELECT tags.id, tags.name
    FROM tags
    JOIN task_tags ON task_tags.tag_id = tags.id
    WHERE task_tags.task_id = ? AND tags.user_id = ?
    ORDER BY tags.name
  `).all(taskId, userId);

  return { ...task, tags };
}

function attachTags(tasks, userId) {
  if (tasks.length === 0) return [];
  const ids = tasks.map((task) => task.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT tt.task_id, tags.id, tags.name
    FROM task_tags AS tt
    JOIN tags ON tags.id = tt.tag_id
    WHERE tt.task_id IN (${placeholders}) AND tags.user_id = ?
    ORDER BY tags.name
  `).all(...ids, userId);

  const grouped = new Map(tasks.map((task) => [task.id, { ...task, tags: [] }]));
  for (const row of rows) {
    grouped.get(row.task_id)?.tags.push({ id: row.id, name: row.name });
  }
  return tasks.map((task) => grouped.get(task.id));
}

const createTaskTx = db.transaction(({ input, userId }) => {
  const createdAt = new Date().toISOString();
  const deadline = normalizeDeadline(input.deadline);

  if (deadline && deadline < createdAt) {
    throw new ApiError(400, 'INVALID_DEADLINE', 'Deadline cannot be earlier than creation date');
  }

  const info = db.prepare(`
    INSERT INTO tasks(title, status, deadline, created_at, completed_at, user_id)
    VALUES (?, 'active', ?, ?, NULL, ?)
  `).run(input.title, deadline, createdAt, userId);

  const taskId = Number(info.lastInsertRowid);
  if (input.tagIds?.length) replaceTaskTags(taskId, input.tagIds, userId);
  writeAuditLog({
    userId,
    action: 'task.created',
    entityType: 'task',
    entityId: taskId,
    details: { title: input.title, tagCount: input.tagIds?.length || 0 }
  });
  return taskId;
});

const updateTaskTx = db.transaction(({ taskId, userId, input }) => {
  const current = db.prepare(
    'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
  ).get(taskId, userId);
  if (!current) return null;

  const title = input.title ?? current.title;
  const status = input.status ?? current.status;
  let completedAt = current.completed_at;
  if (status === 'completed' && current.status !== 'completed') {
    completedAt = new Date().toISOString();
  } else if (status === 'active') {
    completedAt = null;
  }

  let deadline = current.deadline;
  if (Object.prototype.hasOwnProperty.call(input, 'deadline')) {
    deadline = normalizeDeadline(input.deadline);
  }
  if (deadline && deadline < current.created_at) {
    throw new ApiError(400, 'INVALID_DEADLINE', 'Deadline cannot be earlier than creation date');
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, status = ?, deadline = ?, completed_at = ?
    WHERE id = ? AND user_id = ?
  `).run(title, status, deadline, completedAt, taskId, userId);

  if (Object.prototype.hasOwnProperty.call(input, 'tagIds')) {
    replaceTaskTags(taskId, input.tagIds || [], userId);
  }

  writeAuditLog({
    userId,
    action: 'task.updated',
    entityType: 'task',
    entityId: taskId,
    details: { fields: Object.keys(input) }
  });
  return getTaskById(taskId, userId);
});

const deleteTaskTx = db.transaction(({ taskId, userId }) => {
  const current = db.prepare(
    'SELECT id FROM tasks WHERE id = ? AND user_id = ?'
  ).get(taskId, userId);
  if (!current) return false;

  db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(taskId, userId);
  writeAuditLog({
    userId,
    action: 'task.deleted',
    entityType: 'task',
    entityId: taskId
  });
  return true;
});

const replaceTagsTx = db.transaction(({ taskId, userId, tagIds }) => {
  const task = db.prepare(
    'SELECT id FROM tasks WHERE id = ? AND user_id = ?'
  ).get(taskId, userId);
  if (!task) return false;

  replaceTaskTags(taskId, tagIds, userId);
  writeAuditLog({
    userId,
    action: 'task.tags_replaced',
    entityType: 'task',
    entityId: taskId,
    details: { tagCount: tagIds.length }
  });
  return true;
});

function createTask(input, userId) {
  const taskId = createTaskTx({ input, userId });
  return getTaskById(taskId, userId);
}

function listTasks(query, userId) {
  const where = ['t.user_id = ?'];
  const params = [userId];

  if (query.status) {
    where.push('t.status = ?');
    params.push(query.status);
  }
  if (query.tag_id) {
    where.push(`EXISTS (
      SELECT 1 FROM task_tags AS tt WHERE tt.task_id = t.id AND tt.tag_id = ?
    )`);
    params.push(query.tag_id);
  }

  const whereSql = where.join(' AND ');
  const total = db.prepare(
    `SELECT COUNT(*) AS total FROM tasks AS t WHERE ${whereSql}`
  ).get(...params).total;
  const items = db.prepare(`
    SELECT t.* FROM tasks AS t
    WHERE ${whereSql}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, query.limit, (query.page - 1) * query.limit);

  return {
    items: attachTags(items, userId),
    page: query.page,
    limit: query.limit,
    total: Number(total)
  };
}

function getTask(taskId, userId) {
  const task = getTaskById(taskId, userId);
  if (!task) throw notFoundError();
  return task;
}

function updateTask(taskId, userId, input) {
  const task = updateTaskTx({ taskId, userId, input });
  if (!task) throw notFoundError();
  return task;
}

function replaceTaskTagSet(taskId, userId, tagIds) {
  const found = replaceTagsTx({ taskId, userId, tagIds });
  if (!found) throw notFoundError();
  return getTaskById(taskId, userId);
}

function deleteTask(taskId, userId) {
  if (!deleteTaskTx({ taskId, userId })) throw notFoundError();
}

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  replaceTaskTagSet,
  deleteTask
};
