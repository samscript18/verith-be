import { Types } from 'mongoose';
import { AchievementEventType } from '../enums/gamification.enum';
import { GamificationReconciliationService } from './gamification-reconciliation.service';
import { GamificationService } from './gamification.service';

describe('GamificationService celebration delivery', () => {
  it('claims a bounded ordered celebration sequence with one token', async () => {
    const first = {
      _id: new Types.ObjectId(),
      type: AchievementEventType.BADGE_EARNED,
    };
    const second = {
      _id: new Types.ObjectId(),
      type: AchievementEventType.RANK_UP,
    };
    const exec = jest
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(null);
    const achievementEvents = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => ({ exec }) }),
    };
    const service = createService(achievementEvents);

    const result = await service.claimCelebrations(
      new Types.ObjectId().toString(),
    );

    expect(result.celebrations).toEqual([first, second]);
    expect(result.claimToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(achievementEvents.findOneAndUpdate).toHaveBeenCalledTimes(3);
    const calls = achievementEvents.findOneAndUpdate.mock
      .calls as unknown as Array<
      [unknown, { $set: { celebrationClaimToken: string } }]
    >;
    const updates = calls.map((call) => call[1].$set.celebrationClaimToken);
    expect(new Set(updates)).toEqual(new Set([result.claimToken]));
  });

  it('acknowledges only an unseen event owned by the user and claim token', async () => {
    const eventId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const achievementEvents = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ id: eventId.toString() }),
    };
    const service = createService(achievementEvents);

    const result = await service.acknowledgeCelebration(
      userId.toString(),
      eventId.toString(),
      '4d5a2316-a3c7-49f2-a47e-01d829ec5993',
    );

    expect(result).toEqual({
      acknowledged: true,
      celebrationId: eventId.toString(),
    });
    const [filter, update, options] = achievementEvents.findOneAndUpdate.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      { $set: { celebrationSeenAt: unknown } },
      Record<string, unknown>,
    ];
    expect(filter).toEqual({
      _id: eventId,
      userId,
      celebrationClaimToken: '4d5a2316-a3c7-49f2-a47e-01d829ec5993',
      celebrationSeenAt: { $exists: false },
    });
    expect(update.$set.celebrationSeenAt).toBeInstanceOf(Date);
    expect(options).toEqual({ returnDocument: 'after' });
  });
});

describe('GamificationReconciliationService', () => {
  it('creates idempotent completion rewards and activity dates from durable history', async () => {
    const userId = new Types.ObjectId().toString();
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const verifications = {
      find: jest.fn().mockReturnValue(
        query([
          {
            _id: firstId,
            mode: 'STANDARD',
            sourceType: 'TEXT',
            processingCompletedAt: new Date('2026-08-02T10:00:00.000Z'),
          },
          {
            _id: secondId,
            mode: 'GUIDED',
            sourceType: 'SCREENSHOT',
            processingCompletedAt: new Date('2026-08-03T10:00:00.000Z'),
          },
        ]),
      ),
    };
    const service = new GamificationReconciliationService(
      verifications as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
    );

    const rewards = await service.rewards(userId);

    expect(rewards).toHaveLength(4);
    expect(rewards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyReference: `verification:${firstId.toString()}:completed`,
          xp: 25,
          truthPoints: 10,
        }),
        expect.objectContaining({
          idempotencyReference: 'daily-streak:2026-08-03',
        }),
      ]),
    );
  });

  it('excludes the currently completing investigation from quiet historical reconciliation', async () => {
    const userId = new Types.ObjectId().toString();
    const activeVerificationId = new Types.ObjectId().toString();
    const verifications = {
      find: jest.fn().mockReturnValue(
        query([
          {
            _id: new Types.ObjectId(activeVerificationId),
            mode: 'STANDARD',
            sourceType: 'TEXT',
            processingCompletedAt: new Date('2026-08-03T10:00:00.000Z'),
          },
        ]),
      ),
    };
    const service = new GamificationReconciliationService(
      verifications as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
      emptyModel() as never,
    );

    const rewards = await service.rewards(
      userId,
      `verification:${activeVerificationId}:completed`,
    );

    expect(rewards).toEqual([]);
  });
});

function createService(achievementEvents: object) {
  return new GamificationService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    achievementEvents as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function emptyModel() {
  return { find: jest.fn().mockReturnValue(query([])) };
}

function query<T>(result: T[]) {
  const chain = {
    select: jest.fn(),
    sort: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}
