import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { VERIFICATION_QUEUE } from './verification.constants';

@Module({
  imports: [BullModule.registerQueue({ name: VERIFICATION_QUEUE })],
  exports: [BullModule],
})
export class VerificationQueueModule {}
