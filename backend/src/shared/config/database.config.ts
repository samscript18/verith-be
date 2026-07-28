import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  uri: string;
  name: string;
  maxPoolSize: number;
  minPoolSize: number;
  serverSelectionTimeoutMs: number;
  socketTimeoutMs: number;
  autoIndex: boolean;
}

export default registerAs('database', (): DatabaseConfig => ({
  uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/verith',
  name: process.env.MONGODB_DB_NAME ?? 'verith',
  maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 20),
  minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE ?? 2),
  serverSelectionTimeoutMs: Number(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 10000,
  ),
  socketTimeoutMs: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS ?? 45000),
  autoIndex:
    process.env.MONGODB_AUTO_INDEX === 'true' ||
    process.env.NODE_ENV !== 'production',
}));
