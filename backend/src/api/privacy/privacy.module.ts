import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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

@Module({
  imports: [
    UploadsModule,
    RedisModule,
    MongooseModule.forFeature([
      { name: PrivacyJob.name, schema: PrivacyJobSchema },
    ]),
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
