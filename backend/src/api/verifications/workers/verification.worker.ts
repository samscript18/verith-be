import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { VerificationJobData } from '../interfaces/verification-job.interface';
import { VerificationOrchestratorService } from '../services/verification-orchestrator.service';
import { VERIFICATION_QUEUE } from '../verification.constants';

@Processor(VERIFICATION_QUEUE, { concurrency: 5 })
export class VerificationWorker extends WorkerHost {
  constructor(private readonly orchestrator: VerificationOrchestratorService) {
    super();
  }

  process(job: Job<VerificationJobData>): Promise<void> {
    return this.orchestrator.initialize({
      ...job.data,
      attempt: job.attemptsMade + 1,
    });
  }
}
