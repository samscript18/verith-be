import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection, type Model } from 'mongoose';
import { AppModule } from '../../src/app.module';
import {
  ChallengeDifficulty,
  ChallengeStatus,
} from '../../src/api/challenges/enums/challenge.enum';
import { ChallengesService } from '../../src/api/challenges/services/challenges.service';
import {
  BadgeCriteriaType,
  LeaderboardPeriod,
  RewardTransactionType,
} from '../../src/api/gamification/enums/gamification.enum';
import { GamificationService } from '../../src/api/gamification/services/gamification.service';
import { QuizQuestionType } from '../../src/api/quizzes/enums/quiz.enum';
import { UserRole } from '../../src/api/users/enums/user-role.enum';
import { UserStatus } from '../../src/api/users/enums/user-status.enum';
import { User } from '../../src/api/users/schemas/user.schema';

describe('Challenges and gamification persistence (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let users: Model<User>;
  let challenges: ChallengesService;
  let gamification: GamificationService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    users = moduleRef.get<Model<User>>(getModelToken(User.name));
    challenges = moduleRef.get(ChallengesService);
    gamification = moduleRef.get(GamificationService);
  });

  afterAll(async () => {
    for (const collection of [
      'challenge_attempts',
      'challenges',
      'user_badges',
      'badges',
      'reward_transactions',
      'gamification_profiles',
      'users',
    ])
      await connection.collection(collection).deleteMany({});
    await moduleRef.close();
  });

  it('scores challenges and makes rewards, streaks, and badges idempotent', async () => {
    const editorId = new Types.ObjectId().toString();
    const learner = await users.create({
      email: 'learner@example.com',
      emailNormalized: 'learner@example.com',
      username: 'learner',
      usernameNormalized: 'learner',
      passwordHash: 'not-used-in-this-test',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      privacyPreferences: { leaderboard: true },
    });
    await gamification.createBadge(editorId, {
      name: 'First Streak',
      slug: 'first-streak',
      description: 'Completed an eligible activity.',
      category: 'streak',
      criteriaType: BadgeCriteriaType.DAILY_STREAK,
      criteria: { threshold: 1 },
      rarity: 'COMMON',
      reward: { xp: 5, truthPoints: 1 },
    });
    const challenge = await challenges.create(editorId, {
      title: 'Read Beyond the Headline',
      slug: 'read-beyond-headline',
      scenario: 'A sensational headline is circulating.',
      content: 'Inspect the evidence before sharing.',
      difficulty: ChallengeDifficulty.BEGINNER,
      rewardPolicy: { xp: 20, truthPoints: 3 },
      maxAttempts: 2,
      passingScore: 100,
      publishAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      questions: [
        {
          id: 'q1',
          type: QuizQuestionType.SINGLE_CHOICE,
          prompt: 'What should you inspect first?',
          options: [
            { id: 'source', text: 'The source and evidence' },
            { id: 'shares', text: 'The number of shares' },
          ],
          correctOptionIds: ['source'],
          explanation: 'Popularity is not evidence.',
        },
      ],
    });
    await challenges.setStatus(
      challenge._id.toString(),
      ChallengeStatus.PUBLISHED,
    );
    const publicChallenge = await challenges.getBySlug('read-beyond-headline');
    expect(publicChallenge.questions[0]).not.toHaveProperty('correctOptionIds');

    const answer = {
      answers: [{ questionId: 'q1', selectedOptionIds: ['source'] }],
    };
    const first = await challenges.submit(
      learner._id.toString(),
      challenge._id.toString(),
      answer,
    );
    const second = await challenges.submit(
      learner._id.toString(),
      challenge._id.toString(),
      answer,
    );
    expect(first.rewardState).toBe('AWARDED');
    expect(second.rewardState).toBe('ALREADY_AWARDED');

    const profile = await gamification.getProfile(learner._id.toString());
    expect(profile?.xp).toBe(25);
    expect(profile?.truthPoints).toBe(4);
    expect(profile?.currentStreak).toBe(1);
    expect(profile?.badgesCount).toBe(1);
    const transactions = await gamification.listTransactions(
      learner._id.toString(),
    );
    expect(
      transactions.filter(
        (item) => item.type === RewardTransactionType.CHALLENGE_COMPLETED,
      ),
    ).toHaveLength(1);
  });

  it('excludes privacy-disabled users from leaderboards', async () => {
    const hidden = await users.create({
      email: 'hidden@example.com',
      emailNormalized: 'hidden@example.com',
      username: 'hidden',
      usernameNormalized: 'hidden',
      passwordHash: 'not-used-in-this-test',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      privacyPreferences: { leaderboard: false },
    });
    await gamification.award(hidden._id.toString(), {
      type: RewardTransactionType.ADMIN_ADJUSTMENT,
      idempotencyReference: 'test:hidden-adjustment',
      xp: 1000,
      truthPoints: 100,
    });
    const board = await gamification.leaderboard({
      period: LeaderboardPeriod.ALL_TIME,
      limit: 20,
    });
    expect(
      board.some((entry) => entry.userId.toString() === hidden._id.toString()),
    ).toBe(false);
  });
});
