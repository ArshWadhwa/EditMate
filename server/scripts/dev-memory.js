/**
 * Runs the API against a throwaway in-memory MongoDB, so presets work locally
 * before you have a MONGODB_URI. Data is lost when the process exits.
 *
 *   npm run dev:memory -w server
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('editmate');
console.log('In-memory MongoDB started (data resets on exit)');

const stop = () => mongo.stop().finally(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

await import('../src/server.js');
