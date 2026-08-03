import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { VerificationJobData } from '../interfaces/verification-job.interface';
import { VerificationOrchestratorService } from '../services/verification-orchestrator.service';
import { VERIFICATION_QUEUE } from '../verification.constants';

// BullMQ wakes a blocking worker as soon as a job arrives. Long idle waits and
// a slower stalled-job sweep therefore cut empty-queue Redis traffic without
// delaying normal work. A genuinely stalled job can take up to ten minutes to
// be recovered, which is appropriate for long-running AI investigations.
@Processor(VERIFICATION_QUEUE, {
  concurrency: 5,
  drainDelay: 300,
  stalledInterval: 600_000,
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
