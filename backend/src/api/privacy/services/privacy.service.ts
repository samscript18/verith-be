import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Connection, Model, Types } from 'mongoose';
import { ConflictException, NotFoundException } from '../../../core/exceptions';
import type { PrivacyConfig } from '../../../shared/config';
import { UserStatus } from '../../users/enums/user-status.enum';
import {
  CLOUDINARY_PROVIDER,
  type CloudinaryProvider,
} from '../../uploads/interfaces/cloudinary-provider.interface';
import { AssetStatus } from '../../uploads/enums/asset-status.enum';
import { PrivacyJobStatus, PrivacyJobType } from '../enums/privacy-job.enum';
import type { PrivacyQueueJob } from '../interfaces/privacy-job.interface';
import {
  PRIVACY_JOB_SCHEMA_VERSION,
  PRIVACY_QUEUE,
} from '../privacy.constants';
import { PrivacyJob } from '../schemas/privacy-job.schema';
import { PrivacyCryptoService } from './privacy-crypto.service';

@Injectable()
export class PrivacyService {
  private readonly config: PrivacyConfig;

  constructor(
    @InjectModel(PrivacyJob.name)
    private readonly jobs: Model<PrivacyJob>,
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue(PRIVACY_QUEUE)
    private readonly queue: Queue<PrivacyQueueJob>,
    @Inject(CLOUDINARY_PROVIDER)
    private readonly cloudinary: CloudinaryProvider,
    private readonly crypto: PrivacyCryptoService,
    config: ConfigService,
  ) {
    this.config = config.getOrThrow<PrivacyConfig>('privacy');
  }

  async requestExport(userId: string, requestId: string) {
    const existing = await this.jobs
      .findOne({
        userId: new Types.ObjectId(userId),
        type: PrivacyJobType.DATA_EXPORT,
        status: {
          $in: [PrivacyJobStatus.QUEUED, PrivacyJobStatus.PROCESSING],
        },
      })
      .lean()
      .exec();
    if (existing) {
      throw new ConflictException(
        'A data export is already being prepared',
        'DATA_EXPORT_ALREADY_PENDING',
      );
    }
    const token = this.crypto.token();
    const record = await this.jobs.create({
      userId: new Types.ObjectId(userId),
      type: PrivacyJobType.DATA_EXPORT,
      status: PrivacyJobStatus.QUEUED,
      downloadTokenHash: token.hash,
      requestId,
    });
    const jobId = `data-export-${record.id}`;
    try {
      await this.queue.add(
        PrivacyJobType.DATA_EXPORT,
        {
          jobId,
          privacyJobId: record.id,
          userId,
          type: PrivacyJobType.DATA_EXPORT,
          requestId,
          schemaVersion: PRIVACY_JOB_SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
        },
        { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      await this.jobs.updateOne(
        { _id: record._id },
        {
          $set: {
            status: PrivacyJobStatus.FAILED,
            failureCode: 'DATA_EXPORT_QUEUE_UNAVAILABLE',
            failedAt: new Date(),
          },
        },
      );
      throw error;
    }
    return {
      id: record.id,
      status: record.status,
      downloadToken: token.raw,
      message:
        'Store the download token securely; it cannot be retrieved again',
    };
  }

  async status(userId: string, id: string) {
    const record = await this.findOwned(userId, id);
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      bytes: record.bytes ?? null,
      contentHash: record.contentHash ?? null,
      expiresAt: record.expiresAt ?? null,
      failureCode: record.failureCode ?? null,
      createdAt: record.createdAt,
      completedAt: record.completedAt ?? null,
    };
  }

  async download(userId: string, id: string, token: string): Promise<Buffer> {
    const record = await this.jobs
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .select('+downloadTokenHash +encryptedPayload')
      .exec();
    if (
      typeof token !== 'string' ||
      token.length < 40 ||
      token.length > 100 ||
      !record ||
      record.status !== PrivacyJobStatus.COMPLETED ||
      !record.downloadTokenHash ||
      !record.encryptedPayload ||
      !record.expiresAt ||
      record.expiresAt <= new Date()
    ) {
      throw new NotFoundException(
        'The data export is not available',
        'DATA_EXPORT_NOT_AVAILABLE',
      );
    }
    if (!this.crypto.matches(token, record.downloadTokenHash)) {
      throw new NotFoundException(
        'The data export is not available',
        'DATA_EXPORT_NOT_AVAILABLE',
      );
    }
    return this.crypto.decrypt(record.encryptedPayload);
  }

  async processExport(jobId: string, userId: string): Promise<void> {
    const record = await this.jobs.findOneAndUpdate(
      {
        _id: jobId,
        status: {
          $in: [PrivacyJobStatus.QUEUED, PrivacyJobStatus.FAILED],
        },
      },
      { $set: { status: PrivacyJobStatus.PROCESSING } },
      { returnDocument: 'after' },
    );
    if (!record) return;
    try {
      const payload = await this.collectExport(userId);
      const bytes = Buffer.from(JSON.stringify(payload, null, 2));
      const expiresAt = new Date(
        Date.now() + this.config.exportRetentionHours * 60 * 60 * 1000,
      );
      await this.jobs.updateOne(
        { _id: record._id },
        {
          $set: {
            status: PrivacyJobStatus.COMPLETED,
            encryptedPayload: this.crypto.encrypt(bytes),
            contentHash: this.crypto.hash(bytes),
            bytes: bytes.length,
            expiresAt,
            completedAt: new Date(),
          },
        },
      );
    } catch {
      await this.jobs.updateOne(
        { _id: record._id },
        {
          $set: {
            status: PrivacyJobStatus.FAILED,
            failureCode: 'DATA_EXPORT_GENERATION_FAILED',
            failedAt: new Date(),
          },
        },
      );
      throw new Error('Data export generation failed');
    }
  }

  async processPendingDeletions(): Promise<number> {
    const cutoff = new Date(
      Date.now() - this.config.deletionGraceDays * 24 * 60 * 60 * 1000,
    );
    const users = await this.db()
      .collection('users')
      .find({
        status: UserStatus.DELETION_PENDING,
        deletionRequestedAt: { $lte: cutoff },
      })
      .project({ _id: 1 })
      .limit(20)
      .toArray();
    let deleted = 0;
    for (const user of users) {
      await this.eraseAccount(user._id as Types.ObjectId);
      deleted += 1;
    }
    return deleted;
  }

  async eraseAccount(userId: Types.ObjectId): Promise<void> {
    const db = this.db();
    const claimed = await db.collection('users').updateOne(
      {
        _id: userId,
        status: UserStatus.DELETION_PENDING,
        erasureProcessingAt: { $exists: false },
      },
      { $set: { erasureProcessingAt: new Date() } },
    );
    if (claimed.modifiedCount !== 1) return;
    try {
      const assets = await db
        .collection('media_assets')
        .find({
          ownerId: userId,
          status: { $nin: [AssetStatus.DELETED] },
        })
        .project({ publicId: 1, resourceType: 1 })
        .toArray();
      if (assets.length && !this.cloudinary.configured) {
        throw new ConflictException(
          'Account media cannot be erased while Cloudinary is unavailable',
          'ACCOUNT_ERASURE_PROVIDER_UNAVAILABLE',
        );
      }
      for (const asset of assets) {
        await this.cloudinary.deleteAsset(
          String(asset.publicId),
          String(asset.resourceType),
        );
      }

      const verificationIds = (
        await db
          .collection('verifications')
          .find({ userId })
          .project({ _id: 1 })
          .toArray()
      ).map((item) => new Types.ObjectId(String(item._id)));
      const reportIds = (
        await db
          .collection('reports')
          .find({ verificationId: { $in: verificationIds } })
          .project({ _id: 1 })
          .toArray()
      ).map((item) => new Types.ObjectId(String(item._id)));
      const verificationIdStrings = verificationIds.map(String);
      const userIdString = userId.toString();

      await Promise.all([
        db.collection('sessions').deleteMany({ userId }),
        db.collection('auth_tokens').deleteMany({ userId }),
        db.collection('idempotency_records').deleteMany({ userId }),
        db.collection('lesson_progress').deleteMany({ userId }),
        db.collection('quiz_attempts').deleteMany({ userId }),
        db.collection('challenge_attempts').deleteMany({ userId }),
        db.collection('reward_transactions').deleteMany({ userId }),
        db.collection('gamification_profiles').deleteMany({ userId }),
        db.collection('user_badges').deleteMany({ userId }),
        db.collection('notifications').deleteMany({ userId }),
        db.collection('whatsapp_links').deleteMany({ userId }),
        db.collection('whatsapp_messages').deleteMany({ linkedUserId: userId }),
        db.collection('report_feedback').deleteMany({ userId }),
        db.collection('report_exports').deleteMany({ userId }),
        db.collection('privacy_jobs').deleteMany({ userId }),
        db.collection('domain_event_outbox').deleteMany({
          $or: [
            { 'payload.userId': userIdString },
            { aggregateType: 'USER', aggregateId: userIdString },
            {
              aggregateType: 'VERIFICATION',
              aggregateId: { $in: verificationIdStrings },
            },
          ],
        }),
        db
          .collection('claims')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('verification_events')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('evidence')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('claim_evaluations')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('verification_analyses')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('media_analyses')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('transcripts')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('ai_provider_executions')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('search_executions')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db.collection('reports').deleteMany({ _id: { $in: reportIds } }),
        db
          .collection('verification_extracted_contents')
          .deleteMany({ verificationId: { $in: verificationIds } }),
        db
          .collection('verifications')
          .deleteMany({ _id: { $in: verificationIds } }),
        db.collection('media_assets').deleteMany({ ownerId: userId }),
      ]);

      const erasedId = userId.toString();
      await db.collection('users').updateOne(
        { _id: userId, status: UserStatus.DELETION_PENDING },
        {
          $set: {
            email: `erased-${erasedId}@deleted.invalid`,
            emailNormalized: `erased-${erasedId}@deleted.invalid`,
            username: `erased-${erasedId}`,
            usernameNormalized: `erased-${erasedId}`,
            displayName: 'Deleted user',
            passwordHash: '!ACCOUNT_ERASED!',
            status: UserStatus.DELETED,
            deletedAt: new Date(),
            notificationPreferences: {},
            privacyPreferences: { publicProfile: false, leaderboard: false },
          },
          $unset: {
            firstName: 1,
            lastName: 1,
            bio: 1,
            avatar: 1,
            deletionRequestedAt: 1,
            lastLoginAt: 1,
            lastActiveAt: 1,
            erasureProcessingAt: 1,
          },
        },
      );
    } catch (error) {
      await db
        .collection('users')
        .updateOne(
          { _id: userId, status: UserStatus.DELETION_PENDING },
          { $unset: { erasureProcessingAt: 1 } },
        );
      throw error;
    }
  }

  private async collectExport(userId: string) {
    const db = this.db();
    const ownerId = new Types.ObjectId(userId);
    const verifications = await db
      .collection('verifications')
      .find({ userId: ownerId })
      .project({ input: 0, idempotencyKey: 0, eventSequence: 0 })
      .toArray();
    const verificationIds = verifications.map(
      (item) => new Types.ObjectId(String(item._id)),
    );
    const [
      profile,
      sessions,
      reports,
      learningProgress,
      quizAttempts,
      challengeAttempts,
      rewards,
      notifications,
      whatsappLink,
      domainEvents,
    ] = await Promise.all([
      db.collection('users').findOne(
        { _id: ownerId },
        {
          projection: {
            passwordHash: 0,
            emailNormalized: 0,
            usernameNormalized: 0,
          },
        },
      ),
      db
        .collection('sessions')
        .find({ userId: ownerId })
        .project({ refreshTokenHash: 0, ipHash: 0 })
        .toArray(),
      db
        .collection('reports')
        .find({ verificationId: { $in: verificationIds } })
        .project({ providerSummary: 0, methodologyVersions: 0 })
        .toArray(),
      db.collection('lesson_progress').find({ userId: ownerId }).toArray(),
      db.collection('quiz_attempts').find({ userId: ownerId }).toArray(),
      db.collection('challenge_attempts').find({ userId: ownerId }).toArray(),
      db.collection('reward_transactions').find({ userId: ownerId }).toArray(),
      db
        .collection('notifications')
        .find({ userId: ownerId })
        .project({ emailMessageId: 0, emailFailureCode: 0 })
        .toArray(),
      db.collection('whatsapp_links').findOne(
        { userId: ownerId },
        {
          projection: {
            phoneNumberEncrypted: 0,
            phoneNumberHash: 0,
            linkCodeHash: 0,
          },
        },
      ),
      db
        .collection('domain_event_outbox')
        .find({ 'payload.userId': userId })
        .project({
          deduplicationKey: 0,
          lockedUntil: 0,
          lastFailureCode: 0,
        })
        .toArray(),
    ]);
    return {
      schemaVersion: 1,
      generatedAt: new Date(),
      profile,
      sessions,
      verifications,
      reports,
      learningProgress,
      quizAttempts,
      challengeAttempts,
      gamificationHistory: rewards,
      notifications,
      whatsappLink,
      domainEvents,
    };
  }

  private async findOwned(userId: string, id: string) {
    const record = await this.jobs
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!record) {
      throw new NotFoundException(
        'The privacy request could not be found',
        'PRIVACY_REQUEST_NOT_FOUND',
      );
    }
    return record;
  }

  private db() {
    if (!this.connection.db) throw new Error('MongoDB is unavailable');
    return this.connection.db;
  }
}
