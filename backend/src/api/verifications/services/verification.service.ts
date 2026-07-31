import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
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

@Injectable()
export class VerificationService {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly events: VerificationEventService,
    private readonly uploads: UploadsService,
    @InjectModel(IdempotencyRecord.name)
    private readonly idempotencyModel: Model<IdempotencyRecord>,
    @InjectQueue(VERIFICATION_QUEUE)
    private readonly queue: Queue<VerificationJobData>,
  ) {}

  async create(
    userId: string,
    dto: CreateVerificationDto,
    idempotencyKey: string,
    requestId: string,
    trustedWhatsApp = false,
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
    const input = this.buildInput(dto, trustedWhatsApp);
    if (dto.mediaAssetId) {
      await this.uploads.assertVerificationAsset(
        userId,
        dto.mediaAssetId,
        this.allowedAssetTypes(dto.sourceType),
      );
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ...dto, input }))
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

    const verification = await this.repository.create({
      _id: resourceId,
      userId: new Types.ObjectId(userId),
      sourceType: dto.sourceType,
      input,
      ...(dto.title ? { title: dto.title } : {}),
      ...(dto.question ? { question: dto.question } : {}),
      ...(dto.requestedLanguage
        ? { requestedLanguage: dto.requestedLanguage }
        : {}),
      visibility: dto.visibility ?? VerificationVisibility.PRIVATE,
      mediaAssetIds: dto.mediaAssetId
        ? [new Types.ObjectId(dto.mediaAssetId)]
        : [],
      idempotencyKey,
    });
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
    try {
      await this.enqueue(verification.id, requestId, 0);
    } catch {
      verification.status = VerificationStatus.FAILED;
      verification.failedAt = new Date();
      verification.failureCode = 'VERIFICATION_QUEUE_UNAVAILABLE';
      verification.failureSummary =
        'The verification could not be queued for processing';
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
    if (
      ![VerificationStatus.FAILED, VerificationStatus.CANCELLED].includes(
        verification.status,
      )
    ) {
      throw new ConflictException(
        'Only failed or cancelled verifications can be retried',
        'VERIFICATION_NOT_RETRYABLE',
      );
    }
    verification.status = VerificationStatus.QUEUED;
    verification.currentStage = VerificationStage.RECEIVED;
    verification.progress = 0;
    verification.retryCount += 1;
    verification.set('cancelRequestedAt', undefined);
    verification.set('failedAt', undefined);
    verification.set('failureCode', undefined);
    verification.set('failureSummary', undefined);
    await verification.save();
    await this.enqueue(id, requestId, verification.retryCount);
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
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    );
  }

  private buildInput(
    dto: CreateVerificationDto,
    trustedWhatsApp: boolean,
  ): Record<string, unknown> {
    if (
      [
        VerificationSourceType.TEXT,
        VerificationSourceType.WHATSAPP_TEXT,
      ].includes(dto.sourceType) &&
      dto.text &&
      (dto.sourceType === VerificationSourceType.TEXT || trustedWhatsApp)
    )
      return { text: dto.text.trim() };
    if (
      [
        VerificationSourceType.URL,
        VerificationSourceType.WHATSAPP_URL,
      ].includes(dto.sourceType) &&
      dto.url &&
      (dto.sourceType === VerificationSourceType.URL || trustedWhatsApp)
    )
      return { url: dto.url };
    if (
      [
        VerificationSourceType.IMAGE,
        VerificationSourceType.SCREENSHOT,
        VerificationSourceType.AUDIO,
        VerificationSourceType.WHATSAPP_IMAGE,
        VerificationSourceType.WHATSAPP_AUDIO,
      ].includes(dto.sourceType) &&
      dto.mediaAssetId &&
      (!dto.sourceType.startsWith('WHATSAPP_') || trustedWhatsApp)
    ) {
      return { mediaAssetId: dto.mediaAssetId };
    }
    if (dto.sourceType.startsWith('WHATSAPP_')) {
      throw new ValidationException(
        'WhatsApp source types are accepted only by the verified webhook flow',
      );
    }
    throw new ValidationException(
      'The input does not match the selected source type',
    );
  }

  private allowedAssetTypes(sourceType: VerificationSourceType): AssetType[] {
    if (
      [
        VerificationSourceType.AUDIO,
        VerificationSourceType.WHATSAPP_AUDIO,
      ].includes(sourceType)
    )
      return [AssetType.VERIFICATION_AUDIO];
    if (sourceType === VerificationSourceType.SCREENSHOT)
      return [AssetType.VERIFICATION_SCREENSHOT];
    return [AssetType.VERIFICATION_IMAGE];
  }

  private toResponse(record: VerificationDocument): Record<string, unknown> {
    return {
      id: record.id,
      sourceType: record.sourceType,
      status: record.status,
      currentStage: record.currentStage,
      progress: record.progress,
      visibility: record.visibility,
      title: record.title,
      question: record.question,
      requestedLanguage: record.requestedLanguage,
      detectedLanguage: record.detectedLanguage,
      urlMetadata: record.urlMetadata,
      mediaAssetIds: record.mediaAssetIds.map(String),
      claimsCount: record.claimsCount,
      evidenceCount: record.evidenceCount,
      retryCount: record.retryCount,
      failureCode: record.failureCode,
      failureSummary: record.failureSummary,
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
