class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notFoundError() {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function unauthorizedError(message = 'Authentication required') {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON'
      }
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map((item) => ({
          path: item.path.join('.'),
          message: item.message
        }))
      }
    });
  }

  const status = err.status || 500;

  const body = {
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error'
    }
  };

  if (err.details) {
    body.error.details = err.details;
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json(body);
}

module.exports = {
  ApiError,
  notFoundError,
  unauthorizedError,
  errorHandler
};