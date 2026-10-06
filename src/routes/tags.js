const express = require('express');
const { z } = require('zod');
const db = require('../db').db;
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const { ApiError, notFoundError } = require('../utils/errors');

const router = express.Router();

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50)
});

function parseId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid id');
  }

  return id;
}

router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const tags = db
      .prepare('SELECT id, name FROM tags WHERE user_id = ? ORDER BY name')
      .all(req.user.id);

    res.json(tags);
  })
);

router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { name } = createTagSchema.parse(req.body);

    try {
      const info = db
        .prepare('INSERT INTO tags(name, user_id) VALUES (?, ?)')
        .run(name, req.user.id);

      res.status(201).json({
        id: Number(info.lastInsertRowid),
        name
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiError(
          409,
          'TAG_EXISTS',
          'Tag with this name already exists'
        );
      }

      throw error;
    }
  })
);

router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const info = db
      .prepare('DELETE FROM tags WHERE id = ? AND user_id = ?')
      .run(id, req.user.id);

    if (info.changes === 0) {
      throw notFoundError();
    }

    res.status(204).end();
  })
);

module.exports = router;