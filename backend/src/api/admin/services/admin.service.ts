import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { ConflictException, NotFoundException } from '../../../core/exceptions';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { Session } from '../../auth/schemas/session.schema';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import type { VerificationJobData } from '../../verifications/interfaces/verification-job.interface';
import { Verification } from '../../verifications/schemas/verification.schema';
import {
  VERIFICATION_JOB_SCHEMA_VERSION,
  VERIFICATION_QUEUE,
} from '../../verifications/verification.constants';
import type {
  AdminUserQueryDto,
  AdminVerificationQueryDto,
} from '../dto/admin.dto';
import { AuditService } from './audit.service';

interface MutationContext {
  actor: AuthUser;
  requestId: string;
  reason: string;
}

type SafeUserSource = Pick<
  User,
  | 'email'
  | 'username'
  | 'displayName'
  | 'role'
  | 'status'
  | 'emailVerifiedAt'
  | 'lastActiveAt'
  | 'createdAt'
> & { _id: Types.ObjectId };

type SafeVerificationSource = Pick<
  Verification,
  | 'userId'
  | 'sourceType'
  | 'status'
  | 'currentStage'
  | 'progress'
  | 'claimsCount'
  | 'evidenceCount'
  | 'failureCode'
  | 'retryCount'
  | 'createdAt'
  | 'processingCompletedAt'
> & { _id: Types.ObjectId };

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
    @InjectQueue(VERIFICATION_QUEUE)
    private readonly queue: Queue<VerificationJobData>,
    private readonly audit: AuditService,
  ) {}

  async listUsers(query: AdminUserQueryDto) {
    const filter: Record<string, unknown> = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.cursor
        ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
        : {}),
    };
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { emailNormalized: new RegExp(escaped, 'i') },
        { usernameNormalized: new RegExp(escaped, 'i') },
      ];
    }
    const records = await this.users
      .find(filter)
      .select('-passwordHash')
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    return this.page(records, query.limit, (item) => this.safeUser(item));
  }

  async getUser(id: string) {
    const user = await this.users
      .findById(id)
      .select('-passwordHash')
      .lean()
      .exec();
    if (!user)
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    const activeSessions = await this.sessions.countDocuments({
      userId: user._id,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    return { ...this.safeUser(user), activeSessions };
  }

  async changeStatus(id: string, status: UserStatus, context: MutationContext) {
    if (
      ![UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DISABLED].includes(
        status,
      )
    ) {
      throw new ConflictException(
        'This account status cannot be assigned administratively',
        'ADMIN_STATUS_CHANGE_FORBIDDEN',
      );
    }
    const user = await this.requireMutableUser(id, context.actor);
    const before = { status: user.status, role: user.role };
    user.status = status;
    await user.save();
    if (
      [UserStatus.SUSPENDED, UserStatus.DISABLED, UserStatus.DELETED].includes(
        status,
      )
    ) {
      await this.revokeSessions(user._id, `ADMIN_${status}`);
    }
    await this.audit.record({
      ...context,
      action: 'USER_STATUS_CHANGED',
      resourceType: 'USER',
      resourceId: id,
      safeBefore: before,
      safeAfter: { status: user.status, role: user.role },
    });
    return this.safeUser(user.toObject());
  }

  async changeRole(id: string, role: UserRole, context: MutationContext) {
    if (context.actor.userId === id) {
      throw new ConflictException(
        'Administrators cannot change their own role',
        'ADMIN_SELF_ROLE_CHANGE',
      );
    }
    if (context.actor.role !== UserRole.SUPER_ADMIN) {
      throw new ConflictException(
        'Only a super administrator can change roles',
        'ROLE_CHANGE_FORBIDDEN',
      );
    }
    const user = await this.requireMutableUser(id, context.actor);
    const before = { status: user.status, role: user.role };
    user.role = role;
    await user.save();
    await this.revokeSessions(user._id, 'ROLE_CHANGED');
    await this.audit.record({
      ...context,
      action: 'USER_ROLE_CHANGED',
      resourceType: 'USER',
      resourceId: id,
      safeBefore: before,
      safeAfter: { status: user.status, role: user.role },
    });
    return this.safeUser(user.toObject());
  }

  async listVerifications(query: AdminVerificationQueryDto) {
    const records = await this.verifications
      .find({
        ...(query.status ? { status: query.status } : {}),
        ...(query.userId ? { userId: new Types.ObjectId(query.userId) } : {}),
        ...(query.cursor
          ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
          : {}),
      })
      .select('-input')
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    return this.page(records, query.limit, (item) =>
      this.safeVerification(item),
    );
  }

  async retryVerification(id: string, context: MutationContext) {
    const verification = await this.verifications.findById(id).exec();
    if (!verification) {
      throw new NotFoundException(
        'The verification could not be found',
        'VERIFICATION_NOT_FOUND',
      );
    }
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
    const before = {
      status: verification.status,
      retryCount: verification.retryCount,
    };
    verification.status = VerificationStatus.QUEUED;
    verification.retryCount += 1;
    verification.set('failedAt', undefined);
    verification.set('failureCode', undefined);
    verification.set('failureSummary', undefined);
    await verification.save();
    const jobId = `verification-${id}-${verification.retryCount}`;
    try {
      await this.queue.add(
        'initialize',
        {
          jobId,
          verificationId: id,
          requestId: context.requestId,
          attempt: verification.retryCount,
          schemaVersion: VERIFICATION_JOB_SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
        },
        { jobId },
      );
    } catch (error) {
      verification.status = before.status;
      verification.retryCount = before.retryCount;
      await verification.save();
      throw error;
    }
    await this.audit.record({
      ...context,
      action: 'VERIFICATION_RETRIED',
      resourceType: 'VERIFICATION',
      resourceId: id,
      safeBefore: before,
      safeAfter: {
        status: verification.status,
        retryCount: verification.retryCount,
      },
    });
    return this.safeVerification(verification.toObject());
  }

  private async requireMutableUser(id: string, actor: AuthUser) {
    const user = await this.users.findById(id).exec();
    if (!user)
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)
    ) {
      throw new ConflictException(
        'This account cannot be modified by this administrator',
        'ADMIN_PRIVILEGE_BOUNDARY',
      );
    }
    return user;
  }

  private async revokeSessions(userId: Types.ObjectId, reason: string) {
    await this.sessions.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    );
  }

  private safeUser(value: SafeUserSource) {
    return {
      id: value._id.toString(),
      email: value.email,
      username: value.username,
      displayName: value.displayName ?? null,
      role: value.role,
      status: value.status,
      emailVerifiedAt: value.emailVerifiedAt ?? null,
      lastActiveAt: value.lastActiveAt ?? null,
      createdAt: value.createdAt,
    };
  }

  private safeVerification(value: SafeVerificationSource) {
    return {
      id: value._id.toString(),
      userId: value.userId.toString(),
      sourceType: value.sourceType,
      status: value.status,
      currentStage: value.currentStage,
      progress: value.progress,
      claimsCount: value.claimsCount,
      evidenceCount: value.evidenceCount,
      failureCode: value.failureCode ?? null,
      retryCount: value.retryCount,
      createdAt: value.createdAt,
      processingCompletedAt: value.processingCompletedAt ?? null,
    };
  }

  private page<T extends { _id: Types.ObjectId }, R>(
    records: T[],
    limit: number,
    map: (item: T) => R,
  ) {
    const hasNextPage = records.length > limit;
    const page = records.slice(0, limit);
    return {
      items: page.map(map),
      pagination: {
        nextCursor: hasNextPage ? page.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit,
      },
    };
  }
}
