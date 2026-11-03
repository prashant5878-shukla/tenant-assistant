import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { getLogger } from '../logger/index.js';

const log = getLogger('db');
mongoose.set('strictQuery', true);

export async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  try {
    await mongoose.connect(config.MONGO_URI, { dbName: config.MONGO_DB, serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    throw new Error(`Cannot reach MongoDB at ${config.MONGO_URI} (is "docker compose up -d" running?): ${err.message}`);
  }
  log.debug({ db: config.MONGO_DB }, 'connected');
  return mongoose.connection;
}

export async function closeDb() {
  await mongoose.disconnect();
}

/** Create/sync indexes declared on the models. */
export async function ensureIndexes() {
  const { DocumentModel } = await import('./models/Document.js');
  const { ChunkModel } = await import('./models/Chunk.js');
  await Promise.all([DocumentModel.syncIndexes(), ChunkModel.syncIndexes()]);
}
