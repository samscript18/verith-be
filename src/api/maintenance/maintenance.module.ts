import { Module } from '@nestjs/common';
import { runsWorkers } from '../../shared/utils/process-role';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MaintenanceQueueModule } from './maintenance-queue.module';
import { MaintenanceWorker } from './workers/maintenance.worker';

@Module({
  imports: [
    MaintenanceQueueModule,
    NotificationsModule,
    PrivacyModule,
    WhatsAppModule,
  ],
  providers: [...(runsWorkers() ? [MaintenanceWorker] : [])],
})
export class MaintenanceModule {}
