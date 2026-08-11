import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import type { AuditService } from '../../admin/services/audit.service';
import type { User } from '../../users/schemas/user.schema';
import { EntitlementPlan } from '../enums/entitlement-plan.enum';
import type { UserEntitlement } from '../schemas/user-entitlement.schema';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService', () => {
  it('returns configurable free limits without fabricating a subscription', async () => {
    const entitlements = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
      }),
    };
    const service = new EntitlementService(
      entitlements as unknown as Model<UserEntitlement>,
      {} as Model<User>,
      {} as AuditService,
      new ConfigService({ usage: { freeDailyLimit: 4, videoCost: 2 } }),
    );

    await expect(
      service.resolve('507f1f77bcf86cd799439011'),
    ).resolves.toMatchObject({
      plan: EntitlementPlan.FREE,
      source: 'DEFAULT',
      paymentsAvailable: false,
      policy: { dailyInvestigationLimit: 4, videoInvestigationCost: 2 },
    });
  });
});
