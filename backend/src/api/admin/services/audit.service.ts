import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type { AuditQueryDto } from '../dto/admin.dto';
import { AuditLog } from '../schemas/audit-log.schema';

export interface AuditContext {
  actor: AuthUser;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId: string;
  reason: string;
  ipHash?: string;
  userAgentSummary?: string;
  safeBefore?: Record<string, unknown>;
  safeAfter?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLog>,
  ) {}

  async record(context: AuditContext): Promise<void> {
    await this.model.create({
      actorId: new Types.ObjectId(context.actor.userId),
      actorRole: context.actor.role,
      action: context.action,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      requestId: context.requestId,
      reason: context.reason,
      ...(context.ipHash ? { ipHash: context.ipHash } : {}),
      ...(context.userAgentSummary
        ? { userAgentSummary: context.userAgentSummary.slice(0, 200) }
        : {}),
      ...(context.safeBefore ? { safeBefore: context.safeBefore } : {}),
      ...(context.safeAfter ? { safeAfter: context.safeAfter } : {}),
    });
  }

  async list(query: AuditQueryDto) {
    const records = await this.model
      .find({
        ...(query.action ? { action: query.action } : {}),
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.cursor
          ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
          : {}),
      })
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > query.limit;
    const page = records.slice(0, query.limit);
    return {
      items: page.map((item) => ({
        id: item._id.toString(),
        actorId: item.actorId.toString(),
        actorRole: item.actorRole,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        requestId: item.requestId,
        safeBefore: item.safeBefore ?? null,
        safeAfter: item.safeAfter ?? null,
        reason: item.reason,
        createdAt: item.createdAt,
      })),
      pagination: {
        nextCursor: hasNextPage ? page.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }
}
