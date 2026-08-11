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
  name: 'verith',
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMs: 10000,
  socketTimeoutMs: 45000,
  autoIndex: process.env.NODE_ENV !== 'production',
}));
