import { Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { dailyChallengeContent } from '../data/daily-challenge-bank';
import { ChallengeStatus } from '../enums/challenge.enum';
import {
  ChallengeGenerationMode,
  ChallengeGenerationValidationStatus,
} from '../enums/daily-challenge.enum';
import { DailyChallengeService } from './daily-challenge.service';
import { DailyChallengeValidator } from './daily-challenge-validator.service';
import { TemplateDailyChallengeGenerator } from './template-daily-challenge.generator';
import { buildDailyChallengeBlueprint } from '../data/daily-challenge-blueprint';

describe('DailyChallengeService', () => {
  const ownerId = new Types.ObjectId();

  it("does nothing when today's challenge already exists", async () => {
    const existing = {
      _id: new Types.ObjectId(),
      notificationBroadcastAt: new Date(),
    };
    const challenges = {
      find: queryResult([]),
      findOne: queryResult(existing),
      updateOne: jest.fn(),
    };
    const users = { findOne: jest.fn() };
    const service = createService(challenges, users, { broadcast: jest.fn() });

    await service.ensureToday(new Date('2026-08-08T11:30:00.000Z'));

    expect(users.findOne).not.toHaveBeenCalled();
    expect(challenges.updateOne).not.toHaveBeenCalled();
  });

  it('finishes an interrupted notification broadcast without recreating the challenge', async () => {
    const challengeId = new Types.ObjectId();
    const challenges = {
      find: queryResult([]),
      findOne: queryResult({
        _id: challengeId,
        status: ChallengeStatus.PUBLISHED,
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const users = { findOne: jest.fn() };
    const notifications = {
      broadcast: jest
        .fn()
        .mockResolvedValue({ processedCount: 1, notificationCount: 1 }),
    };
    const service = createService(challenges, users, notifications);

    await service.ensureToday(new Date('2026-08-08T11:30:00.000Z'));

    expect(users.findOne).not.toHaveBeenCalled();
    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
    expect(challenges.updateOne).toHaveBeenCalledWith(
      { _id: challengeId },
      {
        $set: { notificationBroadcastAt: new Date('2026-08-08T11:30:00.000Z') },
      },
    );
  });

  it('publishes one idempotent ten-question challenge owned by an active super-admin', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: ownerId });
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    const challenges = {
      find: queryResult([]),
      findOne: queryResult(null),
      updateOne: jest
        .fn()
        .mockResolvedValueOnce({ upsertedCount: 1, upsertedId: ownerId })
        .mockResolvedValueOnce({ modifiedCount: 1 }),
    };
    const users = {
      findOne: jest.fn().mockReturnValue({ select }),
    };
    const notifications = { broadcast: jest.fn().mockResolvedValue({}) };
    const service = createService(challenges, users, notifications);

    await service.ensureToday(new Date('2026-08-08T23:59:00.000Z'));

    expect(users.findOne).toHaveBeenCalledWith({
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
    expect(challenges.updateOne).toHaveBeenCalledTimes(2);
    const [filter, update, options] = challenges.updateOne.mock
      .calls[0] as unknown as [
      { slug: string },
      {
        $setOnInsert: {
          questions: Array<{ id: string }>;
          status: ChallengeStatus;
          createdBy: Types.ObjectId;
          publishAt: Date;
          expiresAt: Date;
        };
      },
      { upsert: boolean },
    ];
    const inserted = update.$setOnInsert;
    expect(filter).toEqual({ slug: 'daily-media-literacy-2026-08-08' });
    expect(options).toEqual({ upsert: true });
    expect(inserted.questions).toHaveLength(10);
    expect(inserted.questions[0]?.id).toBe(
      dailyChallengeContent('2026-08-08').questions[0]?.id,
    );
    expect(inserted.status).toBe(ChallengeStatus.PUBLISHED);
    expect(inserted.createdBy).toEqual(ownerId);
    expect(inserted.publishAt).toEqual(new Date('2026-08-08T00:00:00.000Z'));
    expect(inserted.expiresAt).toEqual(new Date('2026-08-09T00:00:00.000Z'));
    expect(notifications.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DAILY_CHALLENGE',
        idempotencyReference: 'daily-challenge:2026-08-08',
      }),
    );
  });

  it('skips publication when no active super-admin exists', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    const challenges = {
      find: queryResult([]),
      findOne: queryResult(null),
      updateOne: jest.fn(),
    };
    const users = { findOne: jest.fn().mockReturnValue({ select }) };
    const service = createService(challenges, users, { broadcast: jest.fn() });

    await service.ensureToday(new Date('2026-08-08T12:00:00.000Z'));

    expect(challenges.updateOne).not.toHaveBeenCalled();
  });

  it('publishes valid AI content after duplicate validation', async () => {
    const generated = await new TemplateDailyChallengeGenerator().generate(
      buildDailyChallengeBlueprint('2026-08-08'),
    );
    generated.generation = {
      ...generated.generation,
      mode: ChallengeGenerationMode.AI,
      provider: 'GROQ',
      model: 'test-model',
      validationStatus: ChallengeGenerationValidationStatus.PASSED,
    };
    const aiGenerator = { generate: jest.fn().mockResolvedValue(generated) };
    const duplicates = { assertFresh: jest.fn().mockResolvedValue(undefined) };
    const challenges = newChallengeModel(ownerId);
    const service = createService(
      challenges,
      activeOwnerModel(ownerId),
      { broadcast: jest.fn().mockResolvedValue({}) },
      { aiEnabled: true },
      aiGenerator,
      duplicates,
    );

    await service.ensureToday(new Date('2026-08-08T08:00:00.000Z'));

    expect(aiGenerator.generate).toHaveBeenCalledTimes(1);
    expect(duplicates.assertFresh).toHaveBeenCalledTimes(1);
    expect(firstInsert(challenges).generation).toMatchObject({
      mode: ChallengeGenerationMode.AI,
      provider: 'GROQ',
    });
  });

  it('uses the deterministic fallback after an AI generation failure', async () => {
    const aiGenerator = {
      generate: jest.fn().mockRejectedValue({ code: 'GROQ_RATE_LIMITED' }),
    };
    const challenges = newChallengeModel(ownerId);
    const service = createService(
      challenges,
      activeOwnerModel(ownerId),
      { broadcast: jest.fn().mockResolvedValue({}) },
      { aiEnabled: true },
      aiGenerator,
    );

    await service.ensureToday(new Date('2026-08-08T08:00:00.000Z'));

    expect(firstInsert(challenges).generation).toMatchObject({
      mode: ChallengeGenerationMode.TEMPLATE,
      fallbackReason: 'GROQ_RATE_LIMITED',
    });
  });

  it('stores a validated draft when automatic publication is disabled', async () => {
    const notifications = { broadcast: jest.fn() };
    const challenges = newChallengeModel(ownerId);
    const service = createService(
      challenges,
      activeOwnerModel(ownerId),
      notifications,
      { autoPublish: false },
    );

    await service.ensureToday(new Date('2026-08-08T08:00:00.000Z'));

    expect(firstInsert(challenges).status).toBe(ChallengeStatus.DRAFT);
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it('uses a different topic on consecutive days and a broader topic cycle', () => {
    const first = dailyChallengeContent('2026-08-08');
    const next = dailyChallengeContent('2026-08-09');
    const nextWeek = dailyChallengeContent('2026-08-15');

    expect(first.topic.code).not.toBe(next.topic.code);
    expect(first.questions).toHaveLength(10);
    expect(next.questions).toHaveLength(10);
    expect(first.topic.code).not.toBe(nextWeek.topic.code);
    expect(first.questions.every((item) => item.competency)).toBe(true);
    expect(
      first.questions.every((item) => item.topic === first.topic.code),
    ).toBe(true);
  });

  it('keeps previous daily challenges available for duplicate history', async () => {
    const challenges = {
      find: queryResult([{ _id: new Types.ObjectId() }]),
      findOne: queryResult({
        _id: new Types.ObjectId(),
        notificationBroadcastAt: new Date(),
      }),
      deleteMany: jest.fn(),
      updateOne: jest.fn(),
    };
    const service = createService(
      challenges,
      { findOne: jest.fn() },
      { broadcast: jest.fn() },
    );

    await service.ensureToday(new Date('2026-08-09T08:00:00.000Z'));

    expect(challenges.deleteMany).not.toHaveBeenCalled();
  });
});

function createService(
  challenges: unknown,
  users: unknown,
  notifications: unknown,
  configOverrides: Partial<{
    aiEnabled: boolean;
    autoPublish: boolean;
  }> = {},
  aiGenerator: unknown = { generate: jest.fn() },
  duplicates: unknown = { assertFresh: jest.fn() },
) {
  return new DailyChallengeService(
    challenges as never,
    users as never,
    notifications as never,
    aiGenerator as never,
    new TemplateDailyChallengeGenerator(),
    new DailyChallengeValidator(),
    duplicates as never,
    {
      getOrThrow: jest.fn().mockReturnValue({
        aiEnabled: false,
        autoPublish: true,
        duplicateWindowDays: 90,
        maxAiAttempts: 2,
        similarityThreshold: 0.85,
        ...configOverrides,
      }),
    } as never,
  );
}

function activeOwnerModel(owner: Types.ObjectId) {
  return { findOne: queryResult({ _id: owner }) };
}

function newChallengeModel(upsertedId: Types.ObjectId) {
  return {
    findOne: queryResult(null),
    updateOne: jest
      .fn()
      .mockResolvedValueOnce({ upsertedCount: 1, upsertedId })
      .mockResolvedValueOnce({ modifiedCount: 1 }),
  };
}

function firstInsert(challenges: ReturnType<typeof newChallengeModel>) {
  const call = challenges.updateOne.mock.calls[0] as unknown as [
    { slug: string },
    {
      $setOnInsert: {
        generation: { mode: ChallengeGenerationMode; provider?: string };
        status: ChallengeStatus;
      };
    },
  ];
  return call[1].$setOnInsert;
}

function queryResult(value: unknown) {
  return jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(value),
      }),
    }),
  });
}
