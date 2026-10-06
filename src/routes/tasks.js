const express = require('express');
const { z } = require('zod');
const db = require('../db').db;
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const { ApiError, notFoundError } = require('../utils/errors');

const router = express.Router();

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  deadline: z.unknown().optional(),
  tagIds: z.array(z.number().int().positive()).optional()
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['active', 'completed']).optional(),
    deadline: z.unknown().optional(),
    tagIds: z.array(z.number().int().positive()).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Request body must contain at least one updatable field'
  });

const replaceTagsSchema = z.object({
  tagIds: z.array(z.number().int().positive()).default([])
});

const listQuerySchema = z.object({
  status: z.enum(['active', 'completed']).optional(),
  tag_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

function parseId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid id');
  }

  return id;
}

function normalizeDeadline(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Deadline must be a valid date'
    );
  }

  return date.toISOString();
}

function verifyTagsOwnership(tagIds, userId) {
  const uniqueIds = [...new Set(tagIds)];

  if (uniqueIds.length === 0) {
    return;
  }

  const placeholders = uniqueIds.map(() => '?').join(',');

  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tags
       WHERE user_id = ? AND id IN (${placeholders})`
    )
    .get(userId, ...uniqueIds);

  if (Number(row.count) !== uniqueIds.length) {
    throw new ApiError(
      400,
      'TAG_NOT_FOUND',
      'One or more tags do not exist'
    );
  }
}

function replaceTaskTags(taskId, tagIds, userId) {
  const uniqueIds = [...new Set(tagIds)];

  verifyTagsOwnership(uniqueIds, userId);

  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);

  if (uniqueIds.length === 0) {
    return;
  }

  const insert = db.prepare(
    'INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)'
  );

  for (const tagId of uniqueIds) {
    insert.run(taskId, tagId);
  }
}

function getFullTask(taskId, userId) {
  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(taskId, userId);

  if (!task) {
    return null;
  }

  const tags = db
    .prepare(
      `SELECT tags.id, tags.name
       FROM tags
       JOIN task_tags ON task_tags.tag_id = tags.id
       WHERE task_tags.task_id = ? AND tags.user_id = ?
       ORDER BY tags.name`
    )
    .all(taskId, userId);

  return {
    ...task,
    tags
  };
}

function attachTags(tasks, userId) {
  if (tasks.length === 0) {
    return [];
  }

  const taskIds = tasks.map((task) => task.id);
  const placeholders = taskIds.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT tt.task_id, tags.id, tags.name
       FROM task_tags AS tt
       JOIN tags ON tags.id = tt.tag_id
       WHERE tt.task_id IN (${placeholders}) AND tags.user_id = ?
       ORDER BY tags.name`
    )
    .all(...taskIds, userId);

  const map = new Map(
    tasks.map((task) => [task.id, { ...task, tags: [] }])
  );

  for (const row of rows) {
    const task = map.get(row.task_id);

    if (task) {
      task.tags.push({
        id: row.id,
        name: row.name
      });
    }
  }

  return tasks.map((task) => map.get(task.id));
}

const createTaskTransaction = db.transaction(
  ({ title, deadline, tagIds, userId }) => {
    const createdAt = new Date().toISOString();

    if (deadline && deadline < createdAt) {
      throw new ApiError(
        400,
        'INVALID_DEADLINE',
        'Deadline cannot be earlier than creation date'
      );
    }

    const info = db
      .prepare(
        `INSERT INTO tasks(title, status, deadline, created_at, completed_at, user_id)
         VALUES (?, 'active', ?, ?, NULL, ?)`
      )
      .run(title, deadline, createdAt, userId);

    const taskId = Number(info.lastInsertRowid);

    if (tagIds && tagIds.length > 0) {
      replaceTaskTags(taskId, tagIds, userId);
    }

    return taskId;
  }
);

const updateTaskTransaction = db.transaction(({ id, userId, input }) => {
  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(id, userId);

  if (!task) {
    return null;
  }

  const title = input.title ?? task.title;

  let status = task.status;
  let completedAt = task.completed_at;

  if (input.status === 'completed') {
    status = 'completed';
    completedAt = new Date().toISOString();
  }

  if (input.status === 'active') {
    status = 'active';
    completedAt = null;
  }

  if (status === 'completed' && !completedAt) {
    completedAt = new Date().toISOString();
  }

  let deadline = task.deadline;

  if ('deadline' in input) {
    deadline = normalizeDeadline(input.deadline);
  }

  if (deadline && deadline < task.created_at) {
    throw new ApiError(
      400,
      'INVALID_DEADLINE',
      'Deadline cannot be earlier than creation date'
    );
  }

  db.prepare(
    `UPDATE tasks
     SET title = ?, status = ?, deadline = ?, completed_at = ?
     WHERE id = ?`
  ).run(title, status, deadline, completedAt, id);

  if ('tagIds' in input) {
    replaceTaskTags(id, input.tagIds || [], userId);
  }

  return getFullTask(id, userId);
});

const replaceTagsTransaction = db.transaction(({ id, tagIds, userId }) => {
  replaceTaskTags(id, tagIds, userId);
});

router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    const where = ['t.user_id = ?'];
    const params = [req.user.id];

    if (query.status) {
      where.push('t.status = ?');
      params.push(query.status);
    }

    if (query.tag_id) {
      where.push(
        `EXISTS (
          SELECT 1
          FROM task_tags AS tt
          WHERE tt.task_id = t.id AND tt.tag_id = ?
        )`
      );
      params.push(query.tag_id);
    }

    const whereSql = where.join(' AND ');

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM tasks AS t WHERE ${whereSql}`)
      .get(...params);

    const items = db
      .prepare(
        `SELECT t.*
         FROM tasks AS t
         WHERE ${whereSql}
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, query.limit, (query.page - 1) * query.limit);

    res.json({
      items: attachTags(items, req.user.id),
      page: query.page,
      limit: query.limit,
      total: Number(totalRow.total)
    });
  })
);

router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const input = createTaskSchema.parse(req.body);
    const deadline = normalizeDeadline(input.deadline);

    const taskId = createTaskTransaction({
      title: input.title,
      deadline,
      tagIds: input.tagIds || [],
      userId: req.user.id
    });

    const task = getFullTask(taskId, req.user.id);

    res.status(201).json(task);
  })
);

router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = getFullTask(id, req.user.id);

    if (!task) {
      throw notFoundError();
    }

    res.json(task);
  })
);

router.patch(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const input = updateTaskSchema.parse(req.body);

    const task = updateTaskTransaction({
      id,
      userId: req.user.id,
      input
    });

    if (!task) {
      throw notFoundError();
    }

    res.json(task);
  })
);

router.put(
  '/:id/tags',
  auth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { tagIds } = replaceTagsSchema.parse(req.body);

    const taskExists = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?')
      .get(id, req.user.id);

    if (!taskExists) {
      throw notFoundError();
    }

    replaceTagsTransaction({
      id,
      tagIds,
      userId: req.user.id
    });

    res.json(getFullTask(id, req.user.id));
  })
);

router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const info = db
      .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
      .run(id, req.user.id);

    if (info.changes === 0) {
      throw notFoundError();
    }

    res.status(204).end();
  })
);

module.exports = router;