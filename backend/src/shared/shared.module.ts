import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import type { RedisConfig } from './config';
import { MailService } from './mail/mail.service';
import { SafeFetchService } from './services/safe-fetch.service';

const redisOptions = (value: string): RedisOptions => {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    ...(url.protocol === 'rediss:'
      ? { tls: { servername: url.hostname } }
      : {}),
    maxRetriesPerRequest: null,
  };
};

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptions(config.getOrThrow<RedisConfig>('redis').url),
        prefix: 'verith:bull',
      }),
    }),
  ],
  providers: [MailService, SafeFetchService],
  exports: [MailService, SafeFetchService],
})
export class SharedModule {}
