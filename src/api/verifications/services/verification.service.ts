import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { coordinationJobOptions } from '../../../shared/queue/coordination-job-options';
import {
  ConflictException,
  ExternalProviderException,
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { AssetType } from '../../uploads/enums/asset-type.enum';
import { UploadsService } from '../../uploads/uploads.service';
import type {
  CreateVerificationDto,
  VerificationQueryDto,
} from '../dto/verification.dto';
import { VerificationEventStatus } from '../enums/verification-event-status.enum';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import { VerificationStage } from '../enums/verification-stage.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import { VerificationVisibility } from '../enums/verification-visibility.enum';
import type { VerificationJobData } from '../interfaces/verification-job.interface';
import { VerificationRepository } from '../repositories/verification.repository';
import { IdempotencyRecord } from '../schemas/idempotency-record.schema';
import type { VerificationDocument } from '../schemas/verification.schema';
import {
  VERIFICATION_JOB_SCHEMA_VERSION,
  VERIFICATION_QUEUE,
} from '../verification.constants';
import { VerificationEventService } from './verification-event.service';
import { InvestigationUsageService } from './investigation-usage.service';
import { InvestigationMode } from '../enums/investigation-mode.enum';
import { User } from '../../users/schemas/user.schema';
import {
  SupportedLanguage,
  supportedLanguageOrEnglish,
} from '../../../shared/language/supported-language';

@Injectable()
export class VerificationService {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly events: VerificationEventService,
    private readonly uploads: UploadsService,
    private readonly usage: InvestigationUsageService,
    @InjectModel(IdempotencyRecord.name)
    private readonly idempotencyModel: Model<IdempotencyRecord>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectQueue(VERIFICATION_QUEUE)
    private readonly queue: Queue<VerificationJobData>,
  ) {}

  async create(
    userId: string,
    dto: CreateVerificationDto,
    idempotencyKey: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    if (!idempotencyKey) {
      throw new ValidationException(
        'A valid Idempotency-Key header is required',
        [
          {
            field: 'Idempotency-Key',
            message: 'must contain 8 to 128 characters',
          },
        ],
      );
    }
    const input = this.buildInput(dto);
    const requestedLanguage = await this.resolveRequestedLanguage(userId, dto);
    if (dto.mediaAssetId) {
      await this.uploads.assertVerificationAsset(
        userId,
        dto.mediaAssetId,
        this.allowedAssetTypes(dto.sourceType),
      );
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ...dto, requestedLanguage, input }))
      .digest('hex');
    const resourceId = new Types.ObjectId();
    try {
      await this.idempotencyModel.create({
        userId: new Types.ObjectId(userId),
        key: idempotencyKey,
        requestFingerprint: fingerprint,
        resourceId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const existing = await this.idempotencyModel
        .findOne({ userId: new Types.ObjectId(userId), key: idempotencyKey })
        .exec();
      if (!existing || existing.requestFingerprint !== fingerprint) {
        throw new ConflictException(
          'The idempotency key was used with different content',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      const original = await this.repository.findOwned(
        userId,
        existing.resourceId.toString(),
      );
      const recovered =
        original ??
        (await this.waitForIdempotentResource(
          userId,
          existing.resourceId.toString(),
        ));
      if (!recovered) {
        throw new ConflictException(
          'The original idempotent request is not available',
          'IDEMPOTENCY_RESOURCE_UNAVAILABLE',
        );
      }
      return this.toResponse(recovered);
    }

    let reservation;
    try {
      reservation = await this.usage.reserve(
        userId,
        resourceId,
        dto.sourceType,
      );
    } catch (error) {
      await this.idempotencyModel
        .deleteOne({ userId: new Types.ObjectId(userId), key: idempotencyKey })
        .exec();
      throw error;
    }
    let verification: VerificationDocument;
    try {
      verification = await this.repository.create({
        _id: resourceId,
        userId: new Types.ObjectId(userId),
        mode: dto.mode ?? InvestigationMode.STANDARD,
        sourceType: dto.sourceType,
        input,
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.question ? { question: dto.question } : {}),
        requestedLanguage,
        visibility: dto.visibility ?? VerificationVisibility.PRIVATE,
        mediaAssetIds: dto.mediaAssetId
          ? [new Types.ObjectId(dto.mediaAssetId)]
          : [],
        idempotencyKey,
        usageReservation: this.usage.toStored(reservation),
      });
    } catch (error) {
      await this.usage.releaseSnapshot(reservation);
      await this.idempotencyModel
        .deleteOne({ userId: new Types.ObjectId(userId), key: idempotencyKey })
        .exec();
      throw error;
    }
    try {
      if (dto.mediaAssetId) {
        await this.uploads.attachToVerification(
          userId,
          dto.mediaAssetId,
          verification.id,
        );
      }
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.RECEIVED,
        status: VerificationEventStatus.COMPLETED,
        progress: 0,
        messageCode: 'VERIFICATION_RECEIVED',
        safeMessage: 'The verification request was received',
        requestId,
      });
    } catch (error) {
      await this.usage.release(verification);
      verification.status = VerificationStatus.FAILED;
      verification.failedAt = new Date();
      verification.failureCode = 'VERIFICATION_SETUP_FAILED';
      verification.failureSummary =
        'The investigation could not be prepared for processing';
      await verification.save().catch(() => undefined);
      throw error;
    }
    try {
      await this.enqueue(verification.id, requestId, 0);
    } catch {
      verification.status = VerificationStatus.FAILED;
      verification.failedAt = new Date();
      verification.failureCode = 'VERIFICATION_QUEUE_UNAVAILABLE';
      verification.failureSummary =
        'The verification could not be queued for processing';
      await this.usage.release(verification);
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.RECEIVED,
        status: VerificationEventStatus.FAILED,
        progress: 0,
        messageCode: 'VERIFICATION_QUEUE_UNAVAILABLE',
        safeMessage: 'The verification could not be queued for processing',
        requestId,
      });
      throw new ExternalProviderException(
        'The verification queue is unavailable',
        'VERIFICATION_QUEUE_UNAVAILABLE',
      );
    }
    return this.toResponse(verification);
  }

  private async resolveRequestedLanguage(
    userId: string,
    dto: CreateVerificationDto,
  ): Promise<SupportedLanguage> {
    if (dto.requestedLanguage) return dto.requestedLanguage;
    const user = await this.userModel
      .findById(userId)
      .select('preferredLanguage')
      .lean()
      .exec();
    return supportedLanguageOrEnglish(user?.preferredLanguage);
  }

  async get(userId: string, id: string): Promise<Record<string, unknown>> {
    return this.toResponse(await this.findOwned(userId, id));
  }

  async list(userId: string, query: VerificationQueryDto) {
    const records = await this.repository.list(
      userId,
      query.limit,
      query.cursor,
      query.status,
    );
    const hasNextPage = records.length > query.limit;
    const page = records.slice(0, query.limit);
    return {
      items: page.map((record) => this.toResponse(record)),
      pagination: {
        nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  allowance(userId: string): Promise<Record<string, unknown>> {
    return this.usage.status(userId);
  }

  async updateVisibility(
    userId: string,
    id: string,
    visibility: VerificationVisibility,
  ) {
    const verification = await this.findOwned(userId, id);
    verification.visibility = visibility;
    await verification.save();
    return this.toResponse(verification);
  }

  async confirmSourceLanguage(
    userId: string,
    id: string,
    sourceLanguage: SupportedLanguage,
    requestId: string,
  ) {
    const verification = await this.findOwned(userId, id);
    if (
      [
        VerificationStatus.QUEUED,
        VerificationStatus.PROCESSING,
        VerificationStatus.CANCEL_REQUESTED,
      ].includes(verification.status)
    ) {
      throw new ConflictException(
        'Wait for the current investigation pass to finish before confirming its source language',
        'VERIFICATION_LANGUAGE_CONFIRMATION_CONFLICT',
      );
    }
    verification.confirmedSourceLanguage = sourceLanguage;
    verification.detectedLanguage = sourceLanguage;
    verification.languageDetectionConfidence = 1;
    verification.languageConfirmedAt = new Date();
    verification.sourceLanguageExperimental = false;
    await verification.save();
    await this.events.append({
      verificationId: id,
      stage: VerificationStage.LANGUAGE_DETECTION,
      status: VerificationEventStatus.COMPLETED,
      progress: verification.progress,
      messageCode: 'SOURCE_LANGUAGE_CONFIRMED',
      safeMessage:
        'The source language was confirmed for the next investigation pass',
      requestId,
    });
    return this.toResponse(verification);
  }

  async cancel(userId: string, id: string, requestId: string) {
    const verification = await this.findOwned(userId, id);
    if (
      [VerificationStatus.COMPLETED, VerificationStatus.CANCELLED].includes(
        verification.status,
      )
    ) {
      throw new ConflictException(
        'This verification can no longer be cancelled',
        'VERIFICATION_NOT_CANCELLABLE',
      );
    }
    verification.status = VerificationStatus.CANCELLED;
    verification.cancelRequestedAt = new Date();
    await this.usage.release(verification);
    await verification.save();
    await this.events.append({
      verificationId: id,
      stage: verification.currentStage,
      status: VerificationEventStatus.COMPLETED,
      progress: verification.progress,
      messageCode: 'VERIFICATION_CANCELLED',
      safeMessage: 'Verification processing was cancelled',
      requestId,
    });
    return this.toResponse(verification);
  }

  async retry(userId: string, id: string, requestId: string) {
    const verification = await this.findOwned(userId, id);
    if (verification.status !== VerificationStatus.FAILED) {
      throw new ConflictException(
        'Only failed verifications can be retried',
        'VERIFICATION_NOT_RETRYABLE',
      );
    }
    const retryAttempt = verification.retryCount + 1;
    const platformReportFailure =
      verification.currentStage === VerificationStage.REPORT_SYNTHESIS &&
      verification.failureCode === 'VALIDATION_ERROR';
    const reservation = platformReportFailure
      ? undefined
      : await this.usage.reserve(
          userId,
          verification._id,
          verification.sourceType,
          retryAttempt,
        );
    try {
      verification.status = VerificationStatus.QUEUED;
      verification.currentStage = VerificationStage.RECEIVED;
      verification.progress = 0;
      verification.retryCount = retryAttempt;
      if (reservation) {
        verification.usageReservation = this.usage.toStored(reservation);
      }
      verification.set('cancelRequestedAt', undefined);
      verification.set('processingStartedAt', undefined);
      verification.set('processingCompletedAt', undefined);
      verification.set('failedAt', undefined);
      verification.set('failureCode', undefined);
      verification.set('failureSummary', undefined);
      await verification.save();
    } catch (error) {
      if (reservation) await this.usage.releaseSnapshot(reservation);
      throw error;
    }
    try {
      await this.enqueue(id, requestId, verification.retryCount);
    } catch {
      verification.status = VerificationStatus.FAILED;
      verification.failedAt = new Date();
      verification.failureCode = 'VERIFICATION_QUEUE_UNAVAILABLE';
      verification.failureSummary =
        'The verification could not be queued for processing';
      await this.usage.release(verification);
      await verification.save();
      throw new ExternalProviderException(
        'The verification queue is unavailable',
        'VERIFICATION_QUEUE_UNAVAILABLE',
      );
    }
    return this.toResponse(verification);
  }

  async reprocess(userId: string, id: string, requestId: string) {
    const verification = await this.findOwned(userId, id);
    if (
      ![
        VerificationStatus.COMPLETED,
        VerificationStatus.PARTIALLY_COMPLETED,
      ].includes(verification.status)
    ) {
      throw new ConflictException(
        'Only completed verifications can be reprocessed',
        'VERIFICATION_NOT_REPROCESSABLE',
      );
    }
    verification.status = VerificationStatus.QUEUED;
    verification.currentStage = VerificationStage.RECEIVED;
    verification.progress = 0;
    verification.retryCount += 1;
    verification.set('processingStartedAt', undefined);
    verification.set('processingCompletedAt', undefined);
    verification.set('failedAt', undefined);
    verification.set('failureCode', undefined);
    verification.set('failureSummary', undefined);
    await verification.save();
    await this.events.append({
      verificationId: id,
      stage: VerificationStage.RECEIVED,
      status: VerificationEventStatus.COMPLETED,
      progress: 0,
      messageCode: 'VERIFICATION_REPROCESS_REQUESTED',
      safeMessage: 'A new verification pass was requested',
      requestId,
    });
    await this.enqueue(id, requestId, verification.retryCount);
    return this.toResponse(verification);
  }

  async remove(userId: string, id: string): Promise<void> {
    const verification = await this.findOwned(userId, id);
    if (
      [
        VerificationStatus.QUEUED,
        VerificationStatus.PROCESSING,
        VerificationStatus.CANCEL_REQUESTED,
      ].includes(verification.status)
    ) {
      throw new ConflictException(
        'Cancel processing before deleting this verification',
        'VERIFICATION_DELETE_CONFLICT',
      );
    }
    verification.status = VerificationStatus.DELETED;
    verification.deletedAt = new Date();
    await verification.save();
  }

  findOwned(userId: string, id: string): Promise<VerificationDocument> {
    return this.repository.findOwned(userId, id).then((record) => {
      if (!record)
        throw new NotFoundException(
          'The verification could not be found',
          'VERIFICATION_NOT_FOUND',
        );
      return record;
    });
  }

  private async enqueue(
    verificationId: string,
    requestId: string,
    retry: number,
  ): Promise<void> {
    const jobId = `verification-${verificationId}-${retry}`;
    await this.queue.add(
      'initialize',
      {
        jobId,
        verificationId,
        requestId,
        attempt: 1,
        schemaVersion: VERIFICATION_JOB_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
      },
      {
        jobId,
        ...coordinationJobOptions,
      },
    );
  }

  private buildInput(dto: CreateVerificationDto): Record<string, unknown> {
    if (dto.sourceType === VerificationSourceType.TEXT && dto.text)
      return { text: dto.text.trim() };
    if (dto.sourceType === VerificationSourceType.URL && dto.url)
      return { url: dto.url };
    if (
      [
        VerificationSourceType.IMAGE,
        VerificationSourceType.SCREENSHOT,
        VerificationSourceType.AUDIO,
        VerificationSourceType.VIDEO,
      ].includes(dto.sourceType) &&
      dto.mediaAssetId
    ) {
      return { mediaAssetId: dto.mediaAssetId };
    }
    throw new ValidationException(
      'The input does not match the selected source type',
    );
  }

  private allowedAssetTypes(sourceType: VerificationSourceType): AssetType[] {
    if (sourceType === VerificationSourceType.AUDIO)
      return [AssetType.VERIFICATION_AUDIO];
    if (sourceType === VerificationSourceType.VIDEO)
      return [AssetType.VERIFICATION_VIDEO];
    if (sourceType === VerificationSourceType.SCREENSHOT)
      return [AssetType.VERIFICATION_SCREENSHOT];
    return [AssetType.VERIFICATION_IMAGE];
  }

  private toResponse(record: VerificationDocument): Record<string, unknown> {
    return {
      id: record.id,
      mode: record.mode ?? InvestigationMode.STANDARD,
      sourceType: record.sourceType,
      status: record.status,
      currentStage: record.currentStage,
      progress: record.progress,
      visibility: record.visibility,
      title: record.title,
      question: record.question,
      requestedLanguage: record.requestedLanguage,
      detectedLanguage: record.detectedLanguage,
      languageDetectionConfidence: record.languageDetectionConfidence,
      confirmedSourceLanguage: record.confirmedSourceLanguage,
      languageConfirmedAt: record.languageConfirmedAt,
      sourceLanguageNeedsConfirmation:
        !record.confirmedSourceLanguage &&
        typeof record.languageDetectionConfidence === 'number' &&
        record.languageDetectionConfidence < 0.6,
      sourceLanguageExperimental: record.sourceLanguageExperimental,
      urlMetadata: record.urlMetadata,
      mediaAssetIds: record.mediaAssetIds.map(String),
      claimsCount: record.claimsCount,
      evidenceCount: record.evidenceCount,
      retryCount: record.retryCount,
      failureCode: record.failureCode,
      failureSummary: record.failureSummary,
      usage: record.usageReservation
        ? {
            cost: record.usageReservation.cost,
            status: record.usageReservation.status,
            dateKey: record.usageReservation.dateKey,
            timezone: record.usageReservation.timezone,
            resetAt: record.usageReservation.resetAt,
          }
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      streamUrl: `/api/v1/verifications/${record.id}/stream`,
    };
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private async waitForIdempotentResource(
    userId: string,
    resourceId: string,
  ): Promise<VerificationDocument | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      const record = await this.repository.findOwned(userId, resourceId);
      if (record) return record;
    }
    return null;
  }
}
