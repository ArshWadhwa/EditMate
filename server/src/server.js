import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';

const app = createApp({ corsOrigins: config.corsOrigins, databaseConfigured: Boolean(config.mongoUri) });

const server = app.listen(config.port, () => {
  console.log(`EditMate API listening on http://localhost:${config.port}`);
});

if (config.mongoUri) {
  connectDatabase(config.mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error(`MongoDB connection failed: ${err.message}`));
} else {
  console.warn('MONGODB_URI is not set: running without preset storage. See server/.env.example.');
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
