import { registerAs } from '@nestjs/config';

export interface AppConfig {
  name: string;
  host: string;
  port: number;
  apiPrefix: string;
  appUrl: string;
  frontendUrl: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  swaggerEnabled: boolean;
  /**
   * Redis keeps rate limits consistent across multiple API instances. A single
   * API instance can use Nest's process-local store and reserve Redis for
   * BullMQ, which substantially reduces managed-Redis command usage.
   */
  throttlerStorage: 'redis' | 'memory';
}

export default registerAs('app', (): AppConfig => ({
  name: 'Verith',
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 4000),
  apiPrefix: 'api/v1',
  appUrl: process.env.APP_URL ?? 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  // A single Render service running PROCESS_ROLE=all has one API process, so
  // a process-local limiter protects it without turning every ordinary API
  // request into a managed-Redis command. Multi-instance API deployments can
  // opt into the shared limiter explicitly with THROTTLER_STORAGE=redis.
  throttlerStorage:
    process.env.THROTTLER_STORAGE === 'redis' ? 'redis' : 'memory',
}));
