import { Types } from 'mongoose';
import {
  BadgeAvailability,
  BadgeCriteriaType,
  RankCode,
  RewardTransactionType,
} from '../enums/gamification.enum';
import { GamificationService } from './gamification.service';

describe('GamificationService award reliability', () => {
  it('uses one canonical destination-rank reference across competing rewards', async () => {
    const transactions = {
      create: jest
        .fn()
        .mockImplementation((input: { metadata: Record<string, unknown> }) => ({
          _id: new Types.ObjectId(),
          metadata: input.metadata,
        })),
    };
    const notifications = { dispatch: jest.fn() };
    const service = createService({ transactions, notifications });
    const profile = { xp: 250 };
    const internals = service as unknown as {
      recalculate: jest.Mock;
      ensureAchievementBackfill: jest.Mock;
      evaluateBadges: jest.Mock;
      createAchievementEvent: jest.Mock;
    };
    internals.recalculate = jest.fn().mockResolvedValue(profile);
    internals.ensureAchievementBackfill = jest
      .fn()
      .mockResolvedValue({ xp: 249 });
    internals.evaluateBadges = jest.fn();
    internals.createAchievementEvent = jest.fn();

    const userId = new Types.ObjectId().toString();
    await Promise.all([
      service.award(userId, {
        type: RewardTransactionType.LESSON_COMPLETED,
        idempotencyReference: 'lesson:first:completed',
        xp: 1,
        truthPoints: 0,
      }),
      service.award(userId, {
        type: RewardTransactionType.CHALLENGE_COMPLETED,
        idempotencyReference: 'challenge:first:completed',
        xp: 1,
        truthPoints: 0,
      }),
    ]);

    expect(internals.createAchievementEvent).toHaveBeenCalledTimes(2);
    for (const [event] of internals.createAchievementEvent.mock.calls) {
      expect(event).toEqual(
        expect.objectContaining({
          idempotencyReference: `rank-up:${RankCode.EXPLORER}`,
          toRank: RankCode.EXPLORER,
        }),
      );
    }
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyReference: `rank-up:${RankCode.EXPLORER}`,
      }),
    );
  });

  it('repairs reward, celebration, and notification after ownership is already recorded', async () => {
    const badgeId = new Types.ObjectId();
    const ownership = {
      _id: new Types.ObjectId(),
      badgeId,
      badgeCode: 'FIRST_CHECK',
      context: {
        celebrationEligible: true,
        sourceActivityType: RewardTransactionType.VERIFICATION_COMPLETED,
        sourceActivityId: 'source-transaction',
      },
    };
    const transactions = {
      find: jest.fn().mockReturnValue(
        query([
          {
            type: RewardTransactionType.VERIFICATION_COMPLETED,
            metadata: { verificationId: 'verification-1' },
          },
        ]),
      ),
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    const badges = {
      find: jest.fn().mockReturnValue(
        query([
          {
            _id: badgeId,
            code: 'FIRST_CHECK',
            slug: 'first-check',
            name: 'First Check',
            description: 'Completed your first investigation.',
            criteriaType: BadgeCriteriaType.VERIFICATION_COUNT,
            criteria: { threshold: 1 },
            reward: { xp: 25, truthPoints: 10 },
            active: true,
            availability: BadgeAvailability.AVAILABLE,
          },
        ]),
      ),
    };
    const userBadges = {
      create: jest.fn().mockRejectedValue({ code: 11000 }),
      findOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(ownership) }),
    };
    const achievementEvents = { create: jest.fn().mockResolvedValue({}) };
    const notifications = { dispatch: jest.fn().mockResolvedValue({}) };
    const service = createService({
      transactions,
      badges,
      userBadges,
      achievementEvents,
      notifications,
    });
    (service as unknown as { recalculate: jest.Mock }).recalculate = jest
      .fn()
      .mockResolvedValue({ xp: 50 });

    await (
      service as unknown as {
        evaluateBadges(
          userId: string,
          profile: { xp: number; longestStreak: number },
          context: {
            celebrate: boolean;
            sourceActivityType: string;
            sourceActivityId: string;
          },
        ): Promise<void>;
      }
    ).evaluateBadges(
      new Types.ObjectId().toString(),
      { xp: 25, longestStreak: 0 },
      {
        celebrate: true,
        sourceActivityType: RewardTransactionType.VERIFICATION_COMPLETED,
        sourceActivityId: 'source-transaction',
      },
    );

    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyReference: `badge:${badgeId.toString()}`,
        type: RewardTransactionType.BADGE_EARNED,
      }),
    );
    expect(achievementEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyReference: `badge-earned:${badgeId.toString()}`,
      }),
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyReference: `badge-earned:${badgeId.toString()}`,
      }),
    );
  });

  it('awards First Check and creates a celebration for the first completed investigation', async () => {
    const badgeId = new Types.ObjectId();
    const sourceActivityId = new Types.ObjectId().toString();
    const ownership = {
      _id: new Types.ObjectId(),
      badgeId,
      badgeCode: 'FIRST_CHECK',
      context: {
        celebrationEligible: true,
        sourceActivityType: RewardTransactionType.VERIFICATION_COMPLETED,
        sourceActivityId,
      },
    };
    const transactions = {
      find: jest.fn().mockReturnValue(
        query([
          {
            type: RewardTransactionType.VERIFICATION_COMPLETED,
            metadata: { verificationId: 'first-verification' },
          },
        ]),
      ),
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    const badges = {
      find: jest.fn().mockReturnValue(
        query([
          {
            _id: badgeId,
            code: 'FIRST_CHECK',
            slug: 'first-check',
            name: 'First Check',
            description: 'Completed your first Verith investigation.',
            whyItMatters: 'Checking before sharing builds a careful habit.',
            iconKey: 'first-check',
            criteriaType: BadgeCriteriaType.VERIFICATION_COUNT,
            criteria: { threshold: 1 },
            reward: { xp: 25, truthPoints: 10 },
            active: true,
            availability: BadgeAvailability.AVAILABLE,
          },
        ]),
      ),
    };
    const userBadges = { create: jest.fn().mockResolvedValue(ownership) };
    const achievementEvents = { create: jest.fn().mockResolvedValue({}) };
    const notifications = { dispatch: jest.fn().mockResolvedValue({}) };
    const service = createService({
      transactions,
      badges,
      userBadges,
      achievementEvents,
      notifications,
    });
    (service as unknown as { recalculate: jest.Mock }).recalculate = jest
      .fn()
      .mockResolvedValue({ xp: 50 });

    await (
      service as unknown as {
        evaluateBadges(
          userId: string,
          profile: { xp: number; longestStreak: number },
          context: {
            celebrate: boolean;
            sourceActivityType: string;
            sourceActivityId: string;
          },
        ): Promise<void>;
      }
    ).evaluateBadges(
      new Types.ObjectId().toString(),
      { xp: 25, longestStreak: 1 },
      {
        celebrate: true,
        sourceActivityType: RewardTransactionType.VERIFICATION_COMPLETED,
        sourceActivityId,
      },
    );

    expect(userBadges.create).toHaveBeenCalledWith(
      expect.objectContaining({
        badgeCode: 'FIRST_CHECK',
      }),
    );
    expect(achievementEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        badgeCode: 'FIRST_CHECK',
        idempotencyReference: `badge-earned:${badgeId.toString()}`,
      }),
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyReference: `badge-earned:${badgeId.toString()}`,
      }),
    );
  });

  it('counts evidence source fingerprints distinctly and normalizes activity tags', () => {
    const service = createService({});
    const badgeProgress = (
      service as unknown as {
        badgeProgress(
          badge: object,
          activities: object[],
          earned: boolean,
          longestStreak: number,
        ): { current: number; measurable: boolean };
      }
    ).badgeProgress.bind(service);
    const evidence = badgeProgress(
      {
        availability: BadgeAvailability.AVAILABLE,
        criteriaType: BadgeCriteriaType.EVIDENCE_INSPECTION_COUNT,
        criteria: { threshold: 10 },
      },
      [
        {
          type: RewardTransactionType.EVIDENCE_INSPECTED,
          metadata: { sourceFingerprint: 'same-source' },
        },
        {
          type: RewardTransactionType.EVIDENCE_INSPECTED,
          metadata: { sourceFingerprint: 'same-source' },
        },
      ],
      false,
      0,
    );
    const tagged = badgeProgress(
      {
        availability: BadgeAvailability.AVAILABLE,
        criteriaType: BadgeCriteriaType.TAGGED_ACTIVITY_COUNT,
        criteria: { threshold: 3, tags: [' Context '] },
      },
      [
        {
          type: RewardTransactionType.LESSON_COMPLETED,
          metadata: { tags: ['context'] },
        },
      ],
      false,
      0,
    );

    expect(evidence).toEqual(
      expect.objectContaining({ current: 1, measurable: true }),
    );
    expect(tagged).toEqual(
      expect.objectContaining({ current: 1, measurable: true }),
    );
  });

  it('paginates the ledger by created time and ObjectId for equal timestamps', async () => {
    const userId = new Types.ObjectId();
    const cursor = new Types.ObjectId();
    const createdAt = new Date('2026-08-09T10:00:00.000Z');
    let pageFilter: Record<string, unknown> | undefined;
    const transactions = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ _id: cursor, createdAt }),
          }),
        }),
      }),
      find: jest.fn().mockImplementation((filter: Record<string, unknown>) => {
        pageFilter = filter;
        return query([]);
      }),
    };
    const service = createService({ transactions });

    await service.listTransactions(userId.toString(), {
      cursor: cursor.toString(),
      limit: 20,
    });

    expect(pageFilter).toEqual({
      userId,
      $or: [
        { createdAt: { $lt: createdAt } },
        { createdAt, _id: { $lt: cursor } },
      ],
    });
  });

  it('rejects criteria that cannot be measured from recorded activity', () => {
    const service = createService({});
    const validate = (
      service as unknown as {
        validateBadgeDefinition(
          criteriaType: BadgeCriteriaType,
          criteria: Record<string, unknown>,
          reward: { xp?: number; truthPoints?: number },
        ): void;
      }
    ).validateBadgeDefinition.bind(service);

    expect(() =>
      validate(
        BadgeCriteriaType.SPECIAL_EVENT,
        { threshold: 1 },
        { xp: 10, truthPoints: 0 },
      ),
    ).toThrow('not backed by measurable recorded activity');
    expect(() =>
      validate(
        BadgeCriteriaType.TAGGED_ACTIVITY_COUNT,
        { threshold: 1, tags: [] },
        { xp: 10, truthPoints: 0 },
      ),
    ).toThrow('require at least one measurable tag');
  });
});

function createService(overrides: {
  transactions?: object;
  profiles?: object;
  badges?: object;
  userBadges?: object;
  achievementEvents?: object;
  users?: object;
  reconciliation?: object;
  audit?: object;
  notifications?: object;
}) {
  return new GamificationService(
    (overrides.transactions ?? {}) as never,
    (overrides.profiles ?? {}) as never,
    (overrides.badges ?? {}) as never,
    (overrides.userBadges ?? {}) as never,
    (overrides.achievementEvents ?? {}) as never,
    (overrides.users ?? {}) as never,
    (overrides.reconciliation ?? {}) as never,
    (overrides.audit ?? {}) as never,
    (overrides.notifications ?? {}) as never,
  );
}

function query<T>(result: T[]) {
  const chain = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}
