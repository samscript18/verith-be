import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  url: string;
  prefix: string;
}

export default registerAs('redis', (): RedisConfig => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  prefix: 'verith',
}));
