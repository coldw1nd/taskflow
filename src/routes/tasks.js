const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const { ApiError } = require('../utils/errors');
const taskService = require('../services/task-service');

const router = express.Router();

const deadlineSchema = z.string().nullable().optional().refine(
  (value) => value === undefined || value === null || !Number.isNaN(Date.parse(value)),
  'Deadline must be a valid date'
);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  deadline: deadlineSchema,
  tagIds: z.array(z.number().int().positive()).optional()
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'completed']).optional(),
  deadline: deadlineSchema,
  tagIds: z.array(z.number().int().positive()).optional()
}).refine((data) => Object.keys(data).length > 0, {
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

router.get('/', auth, asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.json(taskService.listTasks(query, req.user.id));
}));

router.post('/', auth, asyncHandler(async (req, res) => {
  const input = createTaskSchema.parse(req.body);
  res.status(201).json(taskService.createTask(input, req.user.id));
}));

router.get('/:id', auth, asyncHandler(async (req, res) => {
  res.json(taskService.getTask(parseId(req.params.id), req.user.id));
}));

router.patch('/:id', auth, asyncHandler(async (req, res) => {
  const input = updateTaskSchema.parse(req.body);
  res.json(taskService.updateTask(parseId(req.params.id), req.user.id, input));
}));

router.put('/:id/tags', auth, asyncHandler(async (req, res) => {
  const { tagIds } = replaceTagsSchema.parse(req.body);
  res.json(taskService.replaceTaskTagSet(parseId(req.params.id), req.user.id, tagIds));
}));

router.delete('/:id', auth, asyncHandler(async (req, res) => {
  taskService.deleteTask(parseId(req.params.id), req.user.id);
  res.status(204).end();
}));

module.exports = router;
