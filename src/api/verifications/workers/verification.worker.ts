import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ExternalProviderException } from '../../../core/exceptions';
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
  private readonly logger = new Logger(VerificationWorker.name);

  constructor(private readonly orchestrator: VerificationOrchestratorService) {
    super();
  }

  async process(job: Job<VerificationJobData>): Promise<void> {
    const attempt = job.attemptsMade + 1;
    const startedAt = Date.now();
    this.logger.log({
      event: 'verification_job_started',
      jobId: job.id ?? job.data.jobId,
      verificationId: job.data.verificationId,
      requestId: job.data.requestId,
      attempt,
    });
    try {
      await this.orchestrator.initialize({ ...job.data, attempt });
      this.logger.log({
        // The orchestrator records the actual COMPLETED/FAILED outcome. This
        // event only means the durable queue handler finished cleanly.
        event: 'verification_job_handler_completed',
        jobId: job.id ?? job.data.jobId,
        verificationId: job.data.verificationId,
        requestId: job.data.requestId,
        attempt,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.logger.error({
        event: 'verification_job_failed',
        jobId: job.id ?? job.data.jobId,
        verificationId: job.data.verificationId,
        requestId: job.data.requestId,
        attempt,
        durationMs: Date.now() - startedAt,
        errorClass:
          error instanceof Error ? error.constructor.name : typeof error,
        failureCode:
          error instanceof ExternalProviderException ? error.code : null,
      });
      throw error;
    }
  }
}
