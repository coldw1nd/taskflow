const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const { ApiError } = require('../utils/errors');
const tagService = require('../services/tag-service');

const router = express.Router();
const createTagSchema = z.object({ name: z.string().trim().min(1).max(50) });

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid id');
  }
  return id;
}

router.get('/', auth, asyncHandler(async (req, res) => {
  res.json(tagService.listTags(req.user.id));
}));

router.post('/', auth, asyncHandler(async (req, res) => {
  const { name } = createTagSchema.parse(req.body);
  res.status(201).json(tagService.createTag(name, req.user.id));
}));

router.delete('/:id', auth, asyncHandler(async (req, res) => {
  tagService.deleteTag(parseId(req.params.id), req.user.id);
  res.status(204).end();
}));

module.exports = router;
