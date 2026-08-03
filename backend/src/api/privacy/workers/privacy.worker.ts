import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrivacyJobType } from '../enums/privacy-job.enum';
import type { PrivacyQueueJob } from '../interfaces/privacy-job.interface';
import { PRIVACY_QUEUE } from '../privacy.constants';
import { PrivacyService } from '../services/privacy.service';

@Processor(PRIVACY_QUEUE, {
  concurrency: 2,
  drainDelay: 60,
  stalledInterval: 120_000,
})
export class PrivacyWorker extends WorkerHost {
  constructor(private readonly privacy: PrivacyService) {
    super();
  }

  async process(job: Job<PrivacyQueueJob>): Promise<void> {
    if (job.data.type === PrivacyJobType.DATA_EXPORT) {
      await this.privacy.processExport(job.data.privacyJobId, job.data.userId);
    }
  }
}
