/**
 * Express application factory configuring middleware, routes, and error handling.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { presetsRouter } from './routes/presets.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { databaseState } from './db.js';

export function createApp({ corsOrigins = [], databaseConfigured = true } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, allowedHeaders: ['Content-Type', 'X-Client-Id'] }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: databaseConfigured ? databaseState() : 'not-configured',
    });
  });

  app.use('/api/presets', presetsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
