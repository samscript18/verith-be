import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiModule } from './api/api.module';
import { CoreModule } from './core/core.module';
import {
  aiConfig,
  appConfig,
  type AppConfig,
  authConfig,
  cloudinaryConfig,
  dailyChallengeConfig,
  databaseConfig,
  mailConfig,
  processingConfig,
  privacyConfig,
  redisConfig,
  searchConfig,
  usageConfig,
} from './shared/config';
import { envSchema } from './shared/schemas/env.schema';
import { SharedModule } from './shared/shared.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './api/integrations/redis/redis.module';
import { REDIS_CLIENT } from './api/integrations/redis/redis.constants';
import type Redis from 'ioredis';
import { RedisThrottlerStorage } from './core/services/redis-throttler-storage.service';

const moduleRoot = resolve(__dirname, '..');
const backendRoot = existsSync(resolve(moduleRoot, 'package.json'))
  ? moduleRoot
  : resolve(moduleRoot, '..');
const environment = process.env.NODE_ENV ?? 'development';
const envFilePath = [
  resolve(backendRoot, `.env.${environment}.local`),
  ...(environment === 'test' ? [] : [resolve(backendRoot, '.env.local')]),
  resolve(backendRoot, `.env.${environment}`),
  resolve(backendRoot, '.env'),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath,
      load: [
        aiConfig,
        appConfig,
        authConfig,
        cloudinaryConfig,
        dailyChallengeConfig,
        databaseConfig,
        mailConfig,
        processingConfig,
        privacyConfig,
        redisConfig,
        searchConfig,
        usageConfig,
      ],
      validationSchema: envSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT, ConfigService],
      useFactory: (redis: Redis, config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        return {
          ...(app.throttlerStorage === 'redis'
            ? { storage: new RedisThrottlerStorage(redis) }
            : {}),
          throttlers: [{ name: 'default', ttl: 60000, limit: 120 }],
        };
      },
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    CoreModule,
    SharedModule,
    ApiModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
