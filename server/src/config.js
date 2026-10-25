/**
 * Environment configuration loader and validator for the API server.
 */

import 'dotenv/config';

function list(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = Object.freeze({
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI?.trim() || '',
  corsOrigins: list(process.env.CORS_ORIGIN || 'http://localhost:5173'),
  isProduction: process.env.NODE_ENV === 'production',
});
