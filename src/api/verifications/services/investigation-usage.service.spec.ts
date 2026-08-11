import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ApplicationException } from '../../../core/exceptions';
import type { User } from '../../users/schemas/user.schema';
import { UsageReservationStatus } from '../enums/usage-reservation-status.enum';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import type { DailyInvestigationUsage } from '../schemas/daily-investigation-usage.schema';
import { InvestigationUsageService } from './investigation-usage.service';
import type { EntitlementService } from '../../entitlements/services/entitlement.service';
import { EntitlementPlan } from '../../entitlements/enums/entitlement-plan.enum';

describe('InvestigationUsageService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T10:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('reserves video cost with the capacity check inside the atomic update', async () => {
    const verificationId = new Types.ObjectId();
    const usageId = new Types.ObjectId();
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const exec = jest.fn().mockResolvedValue({
      _id: usageId,
      dateKey: '2026-08-08',
      timezone: 'Africa/Lagos',
      reservations: [
        {
          verificationId,
          cost: 2,
          status: UsageReservationStatus.RESERVED,
          reservedAt: new Date(),
        },
      ],
    });
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec });
    const service = setup({ updateOne, findOneAndUpdate });

    const result = await service.reserve(
      new Types.ObjectId().toString(),
      verificationId,
      VerificationSourceType.VIDEO,
    );

    expect(result).toMatchObject({ cost: 2, dateKey: '2026-08-08' });
    const initialization = (
      updateOne.mock.calls as unknown as Array<
        [
          unknown,
          {
            $set: Record<string, unknown>;
            $setOnInsert: Record<string, unknown>;
          },
          { upsert: boolean },
        ]
      >
    )[0];
    expect(initialization?.[1].$set).toEqual({ limit: 3 });
    expect(initialization?.[1].$setOnInsert).not.toHaveProperty('limit');
    expect(initialization?.[2]).toEqual({ upsert: true });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $expr: { $lte: [{ $add: ['$used', '$reserved', 2] }, '$limit'] },
      }),
      expect.objectContaining({ $inc: { reserved: 2 } }),
      expect.any(Object),
    );
  });

  it('reserves a retry as a separate daily attempt', async () => {
    const verificationId = new Types.ObjectId();
    const usageId = new Types.ObjectId();
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: usageId,
        dateKey: '2026-08-08',
        timezone: 'Africa/Lagos',
        reservations: [
          {
            verificationId,
            attempt: 0,
            cost: 1,
            status: UsageReservationStatus.RELEASED,
            reservedAt: new Date(),
          },
          {
            verificationId,
            attempt: 1,
            cost: 1,
            status: UsageReservationStatus.RESERVED,
            reservedAt: new Date(),
          },
        ],
      }),
    });
    const service = setup({
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOneAndUpdate,
    });

    const result = await service.reserve(
      new Types.ObjectId().toString(),
      verificationId,
      VerificationSourceType.TEXT,
      1,
    );

    expect(result).toMatchObject({ attempt: 1, cost: 1 });
    const retryUpdate = (
      findOneAndUpdate.mock.calls as unknown as Array<
        [
          { reservations: { $not: { $elemMatch: Record<string, unknown> } } },
          { $push: { reservations: Record<string, unknown> } },
        ]
      >
    )[0];
    expect(retryUpdate?.[0].reservations).toEqual({
      $not: { $elemMatch: { verificationId, attempt: 1 } },
    });
    expect(retryUpdate?.[1].$push.reservations).toMatchObject({
      verificationId,
      attempt: 1,
    });
  });

  it('returns an honest limit response and the user-local reset time', async () => {
    const findOne = jest
      .fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            used: 2,
            reserved: 1,
            released: 0,
            limit: 3,
          }),
        }),
      });
    const service = setup({
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findOne,
    });

    await expect(
      service.reserve(
        new Types.ObjectId().toString(),
        new Types.ObjectId(),
        VerificationSourceType.TEXT,
      ),
    ).rejects.toMatchObject<Partial<ApplicationException>>({
      code: 'DAILY_INVESTIGATION_LIMIT_REACHED',
      details: expect.objectContaining({
        remaining: 0,
        resetAt: new Date('2026-08-08T23:00:00.000Z'),
      }),
    });
  });

  it('moves a reservation to used atomically and synchronizes the verification', async () => {
    const usageId = new Types.ObjectId();
    const verificationId = new Types.ObjectId();
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: usageId }),
    });
    const service = setup({ findOneAndUpdate });
    const verification = {
      _id: verificationId,
      usageReservation: {
        usageId,
        dateKey: '2026-08-08',
        timezone: 'Africa/Lagos',
        cost: 1,
        status: UsageReservationStatus.RESERVED,
        resetAt: new Date('2026-08-08T23:00:00.000Z'),
      },
      set: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    await service.consume(verification as never);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $inc: { reserved: -1, used: 1 } }),
      expect.any(Object),
    );
    expect(verification.set).toHaveBeenCalledWith(
      'usageReservation.status',
      UsageReservationStatus.USED,
    );
  });
});

function setup(overrides: {
  updateOne?: jest.Mock;
  findOneAndUpdate?: jest.Mock;
  findOne?: jest.Mock;
}): InvestigationUsageService {
  const usages = {
    updateOne: overrides.updateOne ?? jest.fn(),
    findOneAndUpdate: overrides.findOneAndUpdate ?? jest.fn(),
    findOne: overrides.findOne ?? jest.fn(),
  } as unknown as Model<DailyInvestigationUsage>;
  const users = {
    findById: jest.fn().mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }),
        }),
      }),
    }),
  } as unknown as Model<User>;
  return new InvestigationUsageService(
    usages,
    users,
    new ConfigService({ usage: { freeDailyLimit: 3, videoCost: 2 } }),
    {
      resolve: jest.fn().mockResolvedValue({
        plan: EntitlementPlan.FREE,
        source: 'DEFAULT',
        expiresAt: null,
        paymentsAvailable: false,
        policy: {
          dailyInvestigationLimit: 3,
          videoInvestigationCost: 2,
        },
      }),
    } as unknown as EntitlementService,
  );
}
