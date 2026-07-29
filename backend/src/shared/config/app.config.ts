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
  logLevel: string;
  swaggerEnabled: boolean;
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
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
}));
