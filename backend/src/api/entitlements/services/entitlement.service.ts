import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import {
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { User } from '../../users/schemas/user.schema';
import {
  ENTITLEMENT_POLICIES,
  type EntitlementPolicy,
} from '../data/entitlement-policies';
import type { GrantEntitlementDto } from '../dto/entitlement.dto';
import { EntitlementPlan } from '../enums/entitlement-plan.enum';
import { UserEntitlement } from '../schemas/user-entitlement.schema';
import type { UsageConfig } from '../../../shared/config';

@Injectable()
export class EntitlementService {
  constructor(
    @InjectModel(UserEntitlement.name)
    private readonly entitlements: Model<UserEntitlement>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async resolve(userId: string): Promise<{
    plan: EntitlementPlan;
    policy: EntitlementPolicy;
    source: 'DEFAULT' | 'ADMIN_GRANT';
    expiresAt: Date | null;
    paymentsAvailable: false;
  }> {
    const now = new Date();
    const record = await this.entitlements
      .findOne({
        userId: new Types.ObjectId(userId),
        revokedAt: { $exists: false },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      })
      .lean()
      .exec();
    const plan = record?.plan ?? EntitlementPlan.FREE;
    const configuredUsage = this.config.get<UsageConfig>('usage');
    const configuredDefaults =
      plan === EntitlementPlan.FREE
        ? {
            dailyInvestigationLimit:
              configuredUsage?.freeDailyLimit ??
              ENTITLEMENT_POLICIES[plan].dailyInvestigationLimit,
            videoInvestigationCost:
              configuredUsage?.videoCost ??
              ENTITLEMENT_POLICIES[plan].videoInvestigationCost,
          }
        : {};
    return {
      plan,
      policy: {
        ...ENTITLEMENT_POLICIES[plan],
        ...configuredDefaults,
        ...(record?.overrides ?? {}),
      },
      source: record ? 'ADMIN_GRANT' : 'DEFAULT',
      expiresAt: record?.expiresAt ?? null,
      paymentsAvailable: false,
    };
  }

  async grant(
    userId: string,
    dto: GrantEntitlementDto,
    actor: AuthUser,
    requestId: string,
  ) {
    const exists = await this.users.exists({ _id: new Types.ObjectId(userId) });
    if (!exists)
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date())
      throw new ValidationException('Entitlement expiry must be in the future');
    const record = await this.entitlements.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          plan: dto.plan,
          overrides: dto.overrides ?? {},
          grantedBy: new Types.ObjectId(actor.userId),
          reason: dto.reason,
          startsAt: new Date(),
          ...(expiresAt ? { expiresAt } : {}),
        },
        $unset: {
          revokedAt: 1,
          ...(!expiresAt ? { expiresAt: 1 } : {}),
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    await this.audit.record({
      actor,
      action: 'USER_ENTITLEMENT_GRANTED',
      resourceType: 'USER_ENTITLEMENT',
      resourceId: userId,
      requestId,
      reason: dto.reason,
      safeAfter: {
        plan: dto.plan,
        overrides: dto.overrides ?? {},
        expiresAt: expiresAt ?? null,
      },
    });
    return record;
  }
}
