import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { RedisOptions } from 'ioredis';
import type { RedisConfig } from '../../shared/config';
import { RedisModule } from '../integrations/redis/redis.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PrivacyController } from './controllers/privacy.controller';
import { PRIVACY_QUEUE } from './privacy.constants';
import { PrivacyJob, PrivacyJobSchema } from './schemas/privacy-job.schema';
import { PrivacyCryptoService } from './services/privacy-crypto.service';
import { PrivacyService } from './services/privacy.service';
import { RetentionService } from './services/retention.service';
import { PrivacyWorker } from './workers/privacy.worker';
import { runsScheduler, runsWorkers } from '../../shared/utils/process-role';

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

@Module({
  imports: [
    UploadsModule,
    RedisModule,
    MongooseModule.forFeature([
      { name: PrivacyJob.name, schema: PrivacyJobSchema },
    ]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptions(config.getOrThrow<RedisConfig>('redis').url),
        prefix: 'verith:bull',
      }),
    }),
    BullModule.registerQueue({ name: PRIVACY_QUEUE }),
  ],
  controllers: [PrivacyController],
  providers: [
    PrivacyCryptoService,
    PrivacyService,
    ...(runsWorkers() ? [PrivacyWorker] : []),
    ...(runsScheduler() ? [RetentionService] : []),
  ],
  exports: [PrivacyService],
})
export class PrivacyModule {}
