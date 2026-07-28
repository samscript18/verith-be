import { Injectable } from '@nestjs/common';
import { VerificationEventStatus } from '../enums/verification-event-status.enum';
import { VerificationStage } from '../enums/verification-stage.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import type { VerificationJobData } from '../interfaces/verification-job.interface';
import { VerificationRepository } from '../repositories/verification.repository';
import { VerificationEventService } from './verification-event.service';

@Injectable()
export class VerificationOrchestratorService {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly events: VerificationEventService,
  ) {}

  async initialize(job: VerificationJobData): Promise<void> {
    const verification = await this.repository.findById(job.verificationId);
    if (
      !verification ||
      verification.status === VerificationStatus.DELETED ||
      verification.status === VerificationStatus.CANCELLED
    ) {
      return;
    }
    if (verification.status === VerificationStatus.CANCEL_REQUESTED) {
      verification.status = VerificationStatus.CANCELLED;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: verification.currentStage,
        status: VerificationEventStatus.COMPLETED,
        progress: verification.progress,
        messageCode: 'VERIFICATION_CANCELLED',
        safeMessage: 'Verification processing was cancelled',
        requestId: job.requestId,
        jobId: job.jobId,
      });
      return;
    }
    if (
      verification.status === VerificationStatus.PROCESSING &&
      verification.currentStage === VerificationStage.CONTENT_EXTRACTION
    ) {
      return;
    }

    verification.status = VerificationStatus.PROCESSING;
    verification.currentStage = VerificationStage.INPUT_VALIDATION;
    verification.progress = 5;
    verification.processingStartedAt ??= new Date();
    await verification.save();
    await this.events.append({
      verificationId: verification.id,
      stage: VerificationStage.INPUT_VALIDATION,
      status: VerificationEventStatus.COMPLETED,
      progress: 5,
      messageCode: 'INPUT_VALIDATED',
      safeMessage: 'The submitted content passed input validation',
      requestId: job.requestId,
      jobId: job.jobId,
    });

    verification.currentStage = VerificationStage.CONTENT_EXTRACTION;
    verification.progress = 10;
    await verification.save();
    await this.events.append({
      verificationId: verification.id,
      stage: VerificationStage.CONTENT_EXTRACTION,
      status: VerificationEventStatus.PENDING,
      progress: 10,
      messageCode: 'CONTENT_EXTRACTION_PENDING',
      safeMessage: 'The verification is awaiting content extraction',
      requestId: job.requestId,
      jobId: job.jobId,
    });
  }
}
