import { ZodError } from 'zod';
import { HttpError } from '../lib/httpError.js';

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: err.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
    });
  }

  if (err?.code === 11000) {
    return res.status(409).json({ error: 'A preset with that name already exists' });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
