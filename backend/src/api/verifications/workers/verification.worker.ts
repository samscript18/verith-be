import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { VerificationJobData } from '../interfaces/verification-job.interface';
import { VerificationOrchestratorService } from '../services/verification-orchestrator.service';
import { VERIFICATION_QUEUE } from '../verification.constants';

// BullMQ wakes a blocking worker as soon as a job arrives. These longer idle
// intervals therefore cut empty-queue Redis traffic without delaying work.
@Processor(VERIFICATION_QUEUE, {
  concurrency: 5,
  drainDelay: 60,
  stalledInterval: 120_000,
})
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
