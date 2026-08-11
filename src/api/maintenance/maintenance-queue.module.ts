import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MAINTENANCE_QUEUE } from './maintenance.constants';

@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  exports: [BullModule],
})
export class MaintenanceQueueModule {}
