import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChallengeAttempt } from '../../challenges/schemas/challenge-attempt.schema';
import { Challenge } from '../../challenges/schemas/challenge.schema';
import { LessonProgressStatus } from '../../learning/enums/learning.enum';
import { LessonProgress } from '../../learning/schemas/lesson-progress.schema';
import { Lesson } from '../../learning/schemas/lesson.schema';
import { MissionParticipantStatus } from '../../missions/enums/mission.enum';
import { MissionParticipant } from '../../missions/schemas/mission-participant.schema';
import { Mission } from '../../missions/schemas/mission.schema';
import { QuizAttempt } from '../../quizzes/schemas/quiz-attempt.schema';
import { Quiz } from '../../quizzes/schemas/quiz.schema';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import { Verification } from '../../verifications/schemas/verification.schema';
import { RewardTransactionType } from '../enums/gamification.enum';
import type { RewardInput } from '../interfaces/reward-input.interface';

type Timestamped = {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Rebuilds missing reward facts from product records that are already durable.
 * It intentionally produces data only; GamificationService remains the single
 * writer and applies the reward transaction uniqueness contract.
 */
@Injectable()
export class GamificationReconciliationService {
  constructor(
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
    @InjectModel(LessonProgress.name)
    private readonly lessonProgress: Model<LessonProgress>,
    @InjectModel(Lesson.name) private readonly lessons: Model<Lesson>,
    @InjectModel(QuizAttempt.name)
    private readonly quizAttempts: Model<QuizAttempt>,
    @InjectModel(Quiz.name) private readonly quizzes: Model<Quiz>,
    @InjectModel(ChallengeAttempt.name)
    private readonly challengeAttempts: Model<ChallengeAttempt>,
    @InjectModel(Challenge.name)
    private readonly challenges: Model<Challenge>,
    @InjectModel(MissionParticipant.name)
    private readonly missionParticipants: Model<MissionParticipant>,
    @InjectModel(Mission.name) private readonly missions: Model<Mission>,
  ) {}

  async rewards(
    userId: string,
    excludedRewardReference?: string,
  ): Promise<RewardInput[]> {
    const objectId = new Types.ObjectId(userId);
    const [verifications, progress, quizAttempts, challengeAttempts, missions] =
      await Promise.all([
        this.verifications
          .find({ userId: objectId, status: VerificationStatus.COMPLETED })
          .select(
            '_id mode sourceType processingCompletedAt updatedAt createdAt',
          )
          .lean()
          .exec(),
        this.lessonProgress
          .find({ userId: objectId, status: LessonProgressStatus.COMPLETED })
          .select('_id lessonId courseId completedAt updatedAt createdAt')
          .lean()
          .exec(),
        this.quizAttempts
          .find({ userId: objectId, passed: true })
          .select('_id quizId score createdAt updatedAt')
          .sort({ createdAt: 1, _id: 1 })
          .lean()
          .exec(),
        this.challengeAttempts
          .find({ userId: objectId, passed: true })
          .select('_id challengeId score createdAt updatedAt')
          .sort({ createdAt: 1, _id: 1 })
          .lean()
          .exec(),
        this.missionParticipants
          .find({
            userId: objectId,
            status: MissionParticipantStatus.COMPLETED,
          })
          .select('_id missionId completedAt updatedAt createdAt')
          .lean()
          .exec(),
      ]);

    const firstQuizAttempts = this.firstBy(quizAttempts, (item) =>
      item.quizId.toString(),
    );
    const firstChallengeAttempts = this.firstBy(challengeAttempts, (item) =>
      item.challengeId.toString(),
    );

    const [
      lessonDefinitions,
      quizDefinitions,
      challengeDefinitions,
      missionDefinitions,
    ] = await Promise.all([
      this.lessons
        .find({
          _id: {
            $in: (progress as Array<{ lessonId: Types.ObjectId }>).map(
              (item) => item.lessonId,
            ),
          },
        })
        .select('_id courseId tags')
        .lean()
        .exec(),
      this.quizzes
        .find({
          _id: { $in: firstQuizAttempts.map((item) => item.quizId) },
        })
        .select('_id lessonId courseId rewardPolicy')
        .lean()
        .exec(),
      this.challenges
        .find({
          _id: {
            $in: firstChallengeAttempts.map((item) => item.challengeId),
          },
        })
        .select('_id tags rewardPolicy')
        .lean()
        .exec(),
      this.missions
        .find({
          _id: {
            $in: (missions as Array<{ missionId: Types.ObjectId }>).map(
              (item) => item.missionId,
            ),
          },
        })
        .select('_id topic rewardPolicy')
        .lean()
        .exec(),
    ]);

    const quizLessonIds = (
      quizDefinitions as Array<{ lessonId: Types.ObjectId }>
    ).map((item) => item.lessonId);
    const quizLessons = await this.lessons
      .find({ _id: { $in: quizLessonIds } })
      .select('_id courseId tags')
      .lean()
      .exec();
    const allLessons = [...lessonDefinitions, ...quizLessons] as Array<{
      _id: Types.ObjectId;
      courseId: Types.ObjectId;
      tags: string[];
    }>;
    const lessonById = new Map(
      allLessons.map((item) => [item._id.toString(), item] as const),
    );
    const quizById = new Map(
      (
        quizDefinitions as Array<{
          _id: Types.ObjectId;
          lessonId: Types.ObjectId;
          courseId: Types.ObjectId;
          rewardPolicy: Record<string, unknown>;
        }>
      ).map((item) => [item._id.toString(), item] as const),
    );
    const challengeById = new Map(
      (
        challengeDefinitions as Array<{
          _id: Types.ObjectId;
          tags: string[];
          rewardPolicy: { xp?: number; truthPoints?: number };
        }>
      ).map((item) => [item._id.toString(), item] as const),
    );
    const missionById = new Map(
      (
        missionDefinitions as Array<{
          _id: Types.ObjectId;
          topic: string;
          rewardPolicy: { xp?: number; truthPoints?: number };
        }>
      ).map((item) => [item._id.toString(), item] as const),
    );

    const rewards: RewardInput[] = [];
    const add = (reward: RewardInput) => {
      if (reward.idempotencyReference !== excludedRewardReference)
        rewards.push(reward);
    };

    for (const item of verifications as Array<
      Timestamped & {
        mode: string;
        sourceType: string;
        processingCompletedAt?: Date;
      }
    >) {
      const verificationId = item._id.toString();
      add({
        type: RewardTransactionType.VERIFICATION_COMPLETED,
        idempotencyReference: `verification:${verificationId}:completed`,
        xp: 25,
        truthPoints: 10,
        occurredAt: this.occurredAt(item.processingCompletedAt, item),
        metadata: {
          verificationId,
          mode: item.mode,
          sourceType: item.sourceType,
          reconciledFromHistory: true,
        },
      });
    }

    for (const item of progress as Array<
      Timestamped & {
        lessonId: Types.ObjectId;
        courseId: Types.ObjectId;
        completedAt?: Date;
      }
    >) {
      const lesson = lessonById.get(item.lessonId.toString());
      add({
        type: RewardTransactionType.LESSON_COMPLETED,
        idempotencyReference: `lesson:${item.lessonId.toString()}:completed`,
        xp: 15,
        truthPoints: 5,
        occurredAt: this.occurredAt(item.completedAt, item),
        metadata: {
          lessonId: item.lessonId.toString(),
          courseId: (lesson?.courseId ?? item.courseId).toString(),
          tags: lesson?.tags ?? [],
          reconciledFromHistory: true,
        },
      });
    }

    for (const item of firstQuizAttempts) {
      const quiz = quizById.get(item.quizId.toString());
      if (!quiz) continue;
      const lesson = lessonById.get(quiz.lessonId.toString());
      add({
        type: RewardTransactionType.QUIZ_PASSED,
        idempotencyReference: `quiz:${quiz._id.toString()}:passed`,
        xp: this.rewardValue(quiz.rewardPolicy.xp),
        truthPoints: this.rewardValue(quiz.rewardPolicy.truthPoints),
        occurredAt: this.occurredAt(undefined, item),
        metadata: {
          quizId: quiz._id.toString(),
          lessonId: quiz.lessonId.toString(),
          courseId: quiz.courseId.toString(),
          score: item.score,
          tags: lesson?.tags ?? [],
          reconciledFromHistory: true,
        },
      });
    }

    for (const item of firstChallengeAttempts) {
      const challenge = challengeById.get(item.challengeId.toString());
      if (!challenge) continue;
      add({
        type: RewardTransactionType.CHALLENGE_COMPLETED,
        idempotencyReference: `challenge:${challenge._id.toString()}:completed`,
        xp: this.rewardValue(challenge.rewardPolicy.xp),
        truthPoints: this.rewardValue(challenge.rewardPolicy.truthPoints),
        occurredAt: this.occurredAt(undefined, item),
        metadata: {
          challengeId: challenge._id.toString(),
          score: item.score,
          tags: challenge.tags ?? [],
          reconciledFromHistory: true,
        },
      });
    }

    for (const item of missions as Array<
      Timestamped & { missionId: Types.ObjectId; completedAt?: Date }
    >) {
      const mission = missionById.get(item.missionId.toString());
      if (!mission) continue;
      add({
        type: RewardTransactionType.MISSION_COMPLETED,
        idempotencyReference: `mission:${mission._id.toString()}:completed`,
        xp: this.rewardValue(mission.rewardPolicy.xp),
        truthPoints: this.rewardValue(mission.rewardPolicy.truthPoints),
        occurredAt: this.occurredAt(item.completedAt, item),
        metadata: {
          missionId: mission._id.toString(),
          topic: mission.topic,
          reconciledFromHistory: true,
        },
      });
    }

    const activityDates = new Map<string, Date>();
    for (const reward of rewards) {
      if (!reward.occurredAt) continue;
      const date = reward.occurredAt.toISOString().slice(0, 10);
      const existing = activityDates.get(date);
      if (!existing || reward.occurredAt < existing)
        activityDates.set(date, reward.occurredAt);
    }
    for (const [activityDate, occurredAt] of activityDates) {
      add({
        type: RewardTransactionType.DAILY_STREAK,
        idempotencyReference: `daily-streak:${activityDate}`,
        xp: 0,
        truthPoints: 0,
        occurredAt,
        metadata: { activityDate, reconciledFromHistory: true },
      });
    }

    return rewards.sort(
      (left, right) =>
        (left.occurredAt?.getTime() ?? 0) - (right.occurredAt?.getTime() ?? 0),
    );
  }

  async verificationCompletion(
    verificationId: string,
    userId: string,
  ): Promise<Date | null> {
    if (!Types.ObjectId.isValid(verificationId)) return null;
    const verification = await this.verifications
      .findOne({
        _id: new Types.ObjectId(verificationId),
        userId: new Types.ObjectId(userId),
        status: VerificationStatus.COMPLETED,
      })
      .select('processingCompletedAt updatedAt createdAt')
      .lean()
      .exec();
    if (!verification) return null;
    return this.occurredAt(verification.processingCompletedAt, verification);
  }

  private firstBy<T>(records: T[], key: (record: T) => string): T[] {
    const distinct = new Map<string, T>();
    for (const record of records) {
      const value = key(record);
      if (!distinct.has(value)) distinct.set(value, record);
    }
    return [...distinct.values()];
  }

  private occurredAt(explicit: Date | undefined, record: Timestamped): Date {
    return explicit ?? record.updatedAt ?? record.createdAt ?? new Date();
  }

  private rewardValue(value: unknown): number {
    const amount = Number(value ?? 0);
    return Number.isInteger(amount) && amount >= 0 ? amount : 0;
  }
}
