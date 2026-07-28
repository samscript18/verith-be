import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ApiModule } from './api/api.module';
import { CoreModule } from './core/core.module';
import {
  appConfig,
  authConfig,
  databaseConfig,
  mailConfig,
  redisConfig,
  type AppConfig,
} from './shared/config';
import { envSchema } from './shared/schemas/env.schema';
import { SharedModule } from './shared/shared.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './api/integrations/redis/redis.module';
import { REDIS_CLIENT } from './api/integrations/redis/redis.constants';
import type Redis from 'ioredis';
import { RedisThrottlerStorage } from './core/services/redis-throttler-storage.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, authConfig, databaseConfig, mailConfig, redisConfig],
      validationSchema: envSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<AppConfig>('app');
        return {
          pinoHttp: {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.password',
                '*.token',
                '*.accessToken',
                '*.refreshToken',
              ],
              censor: '[REDACTED]',
            },
            quietReqLogger: true,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [{ name: 'default', ttl: 60000, limit: 120 }],
      }),
    }),
    EventEmitterModule.forRoot(),
    CoreModule,
    SharedModule,
    ApiModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
