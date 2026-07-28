import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConflictException } from '../../../core/exceptions';
import { ValidationException } from '../../../core/exceptions';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import type {
  CreateBadgeDto,
  LeaderboardQueryDto,
} from '../dto/gamification.dto';
import {
  BadgeCriteriaType,
  LeaderboardPeriod,
  RewardTransactionType,
} from '../enums/gamification.enum';
import { Badge } from '../schemas/badge.schema';
import { GamificationProfile } from '../schemas/gamification-profile.schema';
import { RewardTransaction } from '../schemas/reward-transaction.schema';
import { UserBadge } from '../schemas/user-badge.schema';

export interface RewardInput {
  type: RewardTransactionType;
  idempotencyReference: string;
  xp: number;
  truthPoints: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

@Injectable()
export class GamificationService {
  constructor(
    @InjectModel(RewardTransaction.name)
    private readonly transactions: Model<RewardTransaction>,
    @InjectModel(GamificationProfile.name)
    private readonly profiles: Model<GamificationProfile>,
    @InjectModel(Badge.name) private readonly badges: Model<Badge>,
    @InjectModel(UserBadge.name) private readonly userBadges: Model<UserBadge>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async award(userId: string, input: RewardInput) {
    const created = await this.createTransaction(userId, input);
    let profile = await this.recalculate(userId);
    if (created) await this.evaluateBadges(userId, profile);
    if (created) profile = await this.recalculate(userId);
    return { awarded: created, profile };
  }

  async recordEligibleActivity(userId: string, occurredAt = new Date()) {
    const activityDate = occurredAt.toISOString().slice(0, 10);
    return this.award(userId, {
      type: RewardTransactionType.DAILY_STREAK,
      idempotencyReference: `daily-streak:${activityDate}`,
      xp: 0,
      truthPoints: 0,
      metadata: { activityDate },
    });
  }

  async getProfile(userId: string) {
    return this.recalculate(userId);
  }

  async listTransactions(userId: string) {
    return this.transactions
      .find({ userId: new Types.ObjectId(userId) })
      .select('-createdBy')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  async listBadges(userId?: string) {
    const badges = await this.badges.find({ active: true }).lean().exec();
    if (!userId) return badges;
    const earned = await this.userBadges
      .find({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    const earnedIds = new Set(earned.map((item) => item.badgeId.toString()));
    return badges.map((badge) => ({
      ...badge,
      earned: earnedIds.has(badge._id.toString()),
    }));
  }

  async createBadge(userId: string, dto: CreateBadgeDto) {
    const threshold = Number(dto.criteria.threshold);
    const xp = Number(dto.reward.xp ?? 0);
    const truthPoints = Number(dto.reward.truthPoints ?? 0);
    if (
      !Number.isFinite(threshold) ||
      threshold < 1 ||
      !Number.isInteger(xp) ||
      xp < 0 ||
      !Number.isInteger(truthPoints) ||
      truthPoints < 0
    )
      throw new ValidationException(
        'Badge thresholds and rewards must be valid non-negative integers',
      );
    try {
      return await this.badges.create({
        ...dto,
        active: dto.active ?? true,
        createdBy: new Types.ObjectId(userId),
      });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The badge slug already exists',
          'BADGE_SLUG_CONFLICT',
        );
      throw error;
    }
  }

  async leaderboard(query: LeaderboardQueryDto) {
    const since = this.periodStart(query.period);
    const match: Record<string, unknown> = {};
    if (since) match.createdAt = { $gte: since };
    const scores = await this.transactions.aggregate<{
      _id: Types.ObjectId;
      xp: number;
      truthPoints: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          xp: { $sum: '$xp' },
          truthPoints: { $sum: '$truthPoints' },
        },
      },
      { $sort: { xp: -1, truthPoints: -1, _id: 1 } },
      { $limit: Math.min(query.limit * 4, 400) },
    ]);
    const users = await this.users
      .find({
        _id: { $in: scores.map((score) => score._id) },
        status: UserStatus.ACTIVE,
        deletedAt: { $exists: false },
        'privacyPreferences.leaderboard': { $ne: false },
      })
      .select('username displayName privacyPreferences')
      .lean()
      .exec();
    const byId = new Map(users.map((user) => [user._id.toString(), user]));
    return scores
      .filter((score) => byId.has(score._id.toString()))
      .slice(0, query.limit)
      .map((score, index) => {
        const user = byId.get(score._id.toString());
        return {
          rank: index + 1,
          userId: score._id,
          displayName: user?.displayName ?? user?.username,
          xp: score.xp,
          truthPoints: score.truthPoints,
        };
      });
  }

  private async createTransaction(userId: string, input: RewardInput) {
    try {
      await this.transactions.create({
        userId: new Types.ObjectId(userId),
        type: input.type,
        idempotencyReference: input.idempotencyReference,
        xp: input.xp,
        truthPoints: input.truthPoints,
        metadata: input.metadata ?? {},
        ...(input.createdBy
          ? { createdBy: new Types.ObjectId(input.createdBy) }
          : {}),
      });
      return true;
    } catch (error) {
      if (this.isDuplicate(error)) return false;
      throw error;
    }
  }

  private async recalculate(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const [totals] = await this.transactions.aggregate<{
      xp: number;
      truthPoints: number;
    }>([
      { $match: { userId: objectId } },
      {
        $group: {
          _id: null,
          xp: { $sum: '$xp' },
          truthPoints: { $sum: '$truthPoints' },
        },
      },
    ]);
    const activities = await this.transactions
      .find({
        userId: objectId,
        type: RewardTransactionType.DAILY_STREAK,
      })
      .select('metadata')
      .lean()
      .exec();
    const dates = [
      ...new Set(
        activities
          .map((item) => item.metadata.activityDate)
          .filter((date): date is string => typeof date === 'string'),
      ),
    ].sort();
    const streaks = this.calculateStreaks(dates);
    const badgesCount = await this.userBadges.countDocuments({
      userId: objectId,
    });
    const user = await this.users
      .findById(objectId)
      .select('privacyPreferences')
      .lean()
      .exec();
    const xp = Math.max(0, totals?.xp ?? 0);
    return this.profiles.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          xp,
          truthPoints: Math.max(0, totals?.truthPoints ?? 0),
          level: Math.floor(Math.sqrt(xp / 100)) + 1,
          currentStreak: streaks.current,
          longestStreak: streaks.longest,
          lastEligibleActivityDate: dates.at(-1),
          badgesCount,
          leaderboardEligible: user?.privacyPreferences.leaderboard !== false,
        },
        $setOnInsert: { userId: objectId },
      },
      { upsert: true, returnDocument: 'after' },
    );
  }

  private calculateStreaks(dates: string[]) {
    let longest = 0;
    let run = 0;
    let previous: number | undefined;
    for (const date of dates) {
      const day = Date.parse(`${date}T00:00:00.000Z`) / 86400000;
      run = previous !== undefined && day === previous + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = day;
    }
    const today = Math.floor(Date.now() / 86400000);
    const last = dates.length
      ? Date.parse(`${dates[dates.length - 1]}T00:00:00.000Z`) / 86400000
      : undefined;
    return { longest, current: last === today || last === today - 1 ? run : 0 };
  }

  private async evaluateBadges(
    userId: string,
    profile: GamificationProfile | null,
  ) {
    if (!profile) return;
    const badges = await this.badges.find({ active: true }).lean().exec();
    for (const badge of badges) {
      const threshold = Number(badge.criteria.threshold);
      if (!Number.isFinite(threshold) || threshold < 1) continue;
      let achieved = false;
      if (badge.criteriaType === BadgeCriteriaType.DAILY_STREAK)
        achieved = profile.longestStreak >= threshold;
      const transactionType = this.badgeTransactionType(badge.criteriaType);
      if (transactionType)
        achieved =
          (await this.transactions.countDocuments({
            userId: new Types.ObjectId(userId),
            type: transactionType,
          })) >= threshold;
      if (badge.criteriaType === BadgeCriteriaType.QUIZ_SCORE)
        achieved =
          (await this.transactions.countDocuments({
            userId: new Types.ObjectId(userId),
            type: RewardTransactionType.QUIZ_PASSED,
            'metadata.score': { $gte: threshold },
          })) > 0;
      if (!achieved) continue;
      const reference = `badge:${badge._id.toString()}`;
      try {
        await this.userBadges.create({
          userId: new Types.ObjectId(userId),
          badgeId: badge._id,
          idempotencyReference: reference,
          context: { criteriaType: badge.criteriaType, threshold },
        });
      } catch (error) {
        if (this.isDuplicate(error)) continue;
        throw error;
      }
      await this.createTransaction(userId, {
        type: RewardTransactionType.BADGE_EARNED,
        idempotencyReference: reference,
        xp: Number(badge.reward.xp ?? 0),
        truthPoints: Number(badge.reward.truthPoints ?? 0),
        metadata: { badgeId: badge._id.toString() },
      });
    }
  }

  private periodStart(period: LeaderboardPeriod) {
    if (period === LeaderboardPeriod.ALL_TIME) return undefined;
    const now = new Date();
    if (period === LeaderboardPeriod.WEEKLY) {
      const day = (now.getUTCDay() + 6) % 7;
      return new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - day,
        ),
      );
    }
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private badgeTransactionType(criteriaType: BadgeCriteriaType) {
    const mapping: Partial<Record<BadgeCriteriaType, RewardTransactionType>> = {
      [BadgeCriteriaType.VERIFICATION_COUNT]:
        RewardTransactionType.VERIFICATION_COMPLETED,
      [BadgeCriteriaType.LESSON_COUNT]: RewardTransactionType.LESSON_COMPLETED,
      [BadgeCriteriaType.CHALLENGE_STREAK]:
        RewardTransactionType.CHALLENGE_COMPLETED,
    };
    return mapping[criteriaType];
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
