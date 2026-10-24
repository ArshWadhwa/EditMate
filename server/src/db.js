import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/** 'connected' | 'connecting' | 'disconnected' */
export function databaseState() {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
