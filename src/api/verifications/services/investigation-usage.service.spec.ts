import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ApplicationException } from '../../../core/exceptions';
import type { User } from '../../users/schemas/user.schema';
import { UsageReservationStatus } from '../enums/usage-reservation-status.enum';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import type { DailyInvestigationUsage } from '../schemas/daily-investigation-usage.schema';
import type { Verification } from '../schemas/verification.schema';
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

  it('returns a consumed attempt when the investigation later fails', async () => {
    const usageId = new Types.ObjectId();
    const verificationId = new Types.ObjectId();
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ _id: usageId }),
      });
    const service = setup({ findOneAndUpdate });
    const verification = {
      _id: verificationId,
      usageReservation: {
        usageId,
        attempt: 1,
        dateKey: '2026-08-08',
        timezone: 'Africa/Lagos',
        cost: 2,
        status: UsageReservationStatus.USED,
        resetAt: new Date('2026-08-08T23:00:00.000Z'),
      },
      set: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    await service.release(verification as never);

    const releaseCalls = findOneAndUpdate.mock.calls as unknown as Array<
      [
        { reservations: { $elemMatch: { status: UsageReservationStatus } } },
        { $inc: Record<string, number> },
      ]
    >;
    expect(releaseCalls[0]?.[0].reservations.$elemMatch.status).toBe(
      UsageReservationStatus.RESERVED,
    );
    expect(releaseCalls[0]?.[1].$inc).toEqual({ reserved: -2, released: 2 });
    expect(releaseCalls[1]?.[0].reservations.$elemMatch.status).toBe(
      UsageReservationStatus.USED,
    );
    expect(releaseCalls[1]?.[1].$inc).toEqual({ used: -2, released: 2 });
    expect(verification.set).toHaveBeenCalledWith(
      'usageReservation.status',
      UsageReservationStatus.RELEASED,
    );
  });

  it('does not refund an attempt more than once', async () => {
    const service = setup({ findOneAndUpdate: jest.fn() });
    const verification = {
      usageReservation: {
        status: UsageReservationStatus.RELEASED,
      },
      set: jest.fn(),
      save: jest.fn(),
    };

    await service.release(verification as never);

    expect(verification.save).not.toHaveBeenCalled();
  });

  it("repairs today's allowance for an investigation that already failed", async () => {
    const usageId = new Types.ObjectId();
    const verificationId = new Types.ObjectId();
    const usedReservation = {
      verificationId,
      attempt: 0,
      cost: 1,
      status: UsageReservationStatus.USED,
      reservedAt: new Date(),
    };
    const findOne = jest
      .fn()
      .mockReturnValueOnce({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            _id: usageId,
            userId: new Types.ObjectId(),
            dateKey: '2026-08-08',
            timezone: 'Africa/Lagos',
            limit: 3,
            used: 1,
            reserved: 0,
            released: 0,
            reservations: [usedReservation],
          }),
        }),
      })
      .mockReturnValueOnce({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            used: 0,
            reserved: 0,
            released: 1,
            reservations: [
              {
                ...usedReservation,
                status: UsageReservationStatus.RELEASED,
              },
            ],
          }),
        }),
      });
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ _id: usageId }),
      });
    const service = setup({
      findOne,
      findOneAndUpdate,
      verificationFind: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: jest.fn().mockResolvedValue([{ _id: verificationId }]),
          }),
        }),
      }),
    });

    const status = await service.status(new Types.ObjectId().toString());

    expect(status).toMatchObject({ used: 0, reserved: 0, remaining: 3 });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});

function setup(overrides: {
  updateOne?: jest.Mock;
  findOneAndUpdate?: jest.Mock;
  findOne?: jest.Mock;
  verificationFind?: jest.Mock;
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
  const verifications = {
    find:
      overrides.verificationFind ??
      jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
        }),
      }),
  } as unknown as Model<Verification>;
  return new InvestigationUsageService(
    usages,
    users,
    verifications,
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
