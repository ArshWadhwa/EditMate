/**
 * Middleware ensuring database connectivity before executing queries.
 */

import { databaseState } from '../db.js';
import { HttpError } from '../lib/httpError.js';

export function requireDatabase(_req, _res, next) {
  if (databaseState() !== 'connected') {
    return next(new HttpError(503, 'Preset storage is unavailable. Set MONGODB_URI and restart the API.'));
  }
  next();
}
