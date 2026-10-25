/**
 * Middleware requiring and validating client identification headers.
 */

import { HttpError } from '../lib/httpError.js';

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function requireClientId(req, _res, next) {
  const clientId = req.get('x-client-id');
  if (!clientId || !CLIENT_ID.test(clientId)) {
    return next(new HttpError(400, 'Missing or invalid X-Client-Id header'));
  }
  req.clientId = clientId;
  next();
}
