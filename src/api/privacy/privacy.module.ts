import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '../integrations/redis/redis.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PrivacyController } from './controllers/privacy.controller';
import { PrivacyJob, PrivacyJobSchema } from './schemas/privacy-job.schema';
import { PrivacyCryptoService } from './services/privacy-crypto.service';
import { PrivacyService } from './services/privacy.service';
import { RetentionService } from './services/retention.service';
import { runsScheduler } from '../../shared/utils/process-role';
import { MaintenanceQueueModule } from '../maintenance/maintenance-queue.module';

@Module({
  imports: [
    UploadsModule,
    RedisModule,
    MongooseModule.forFeature([
      { name: PrivacyJob.name, schema: PrivacyJobSchema },
    ]),
    MaintenanceQueueModule,
  ],
  controllers: [PrivacyController],
  providers: [
    PrivacyCryptoService,
    PrivacyService,
    ...(runsScheduler() ? [RetentionService] : []),
  ],
  exports: [PrivacyService],
})
export class PrivacyModule {}
