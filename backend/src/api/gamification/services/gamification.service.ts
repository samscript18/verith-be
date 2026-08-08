import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import type {
  BadgeAdminQueryDto,
  BadgeCatalogQueryDto,
  CreateBadgeDto,
  BadgeQueryDto,
  LeaderboardQueryDto,
  RewardTransactionQueryDto,
  UpdateBadgeDto,
} from '../dto/gamification.dto';
import { BadgeEarnedFilter } from '../dto/gamification.dto';
import { searchPattern } from '../../../shared/utils/search-query';
import {
  AchievementEventType,
  BadgeAvailability,
  BadgeCriteriaType,
  LeaderboardPeriod,
  RewardTransactionType,
} from '../enums/gamification.enum';
import { Badge } from '../schemas/badge.schema';
import { GamificationProfile } from '../schemas/gamification-profile.schema';
import { RewardTransaction } from '../schemas/reward-transaction.schema';
import { UserBadge } from '../schemas/user-badge.schema';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { AchievementEvent } from '../schemas/achievement-event.schema';
import { calculateRankProgress } from '../utils/rank-progress';
import {
  ACHIEVEMENT_CATALOG_VERSION,
  RANK_THRESHOLDS,
} from '../constants/rank.constants';
import { InvestigationMode } from '../../verifications/enums/investigation-mode.enum';

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
    @InjectModel(AchievementEvent.name)
    private readonly achievementEvents: Model<AchievementEvent>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async award(userId: string, input: RewardInput) {
    const initialBaseline = await this.recalculate(userId);
    const baseline = await this.ensureAchievementBackfill(
      userId,
      initialBaseline,
    );
    const previousXp = baseline?.xp ?? 0;
    const created = await this.createTransaction(userId, input);
    let profile = await this.recalculate(userId);
    if (created)
      await this.evaluateBadges(userId, profile, {
        celebrate: true,
        sourceActivityId: created._id.toString(),
        sourceActivityType: input.type,
      });
    if (created) profile = await this.recalculate(userId);
    const previousRank = calculateRankProgress(previousXp);
    const nextRank = calculateRankProgress(profile?.xp ?? previousXp);
    if (
      created &&
      profile &&
      previousRank.currentRank !== nextRank.currentRank &&
      nextRank.currentXp > previousRank.currentXp
    ) {
      await this.createAchievementEvent({
        userId,
        type: AchievementEventType.RANK_UP,
        idempotencyReference: `rank-up:${created._id.toString()}:${nextRank.currentRank}`,
        fromRank: previousRank.currentRank,
        toRank: nextRank.currentRank,
        sourceActivityType: input.type,
        sourceActivityId: created._id.toString(),
        metadata: {
          currentXp: nextRank.currentXp,
          currentRankLabel: nextRank.currentRankLabel,
        },
      });
      await this.notifications.dispatch({
        userId,
        type: NotificationType.LEVEL_UP,
        title: `You reached ${nextRank.currentRankLabel}`,
        message:
          'Your persisted Verith activity moved you into a new achievement rank.',
        actionUrl: '/app/achievements',
        idempotencyReference: `rank-up:${created._id.toString()}:${nextRank.currentRank}`,
        metadata: {
          fromRank: previousRank.currentRank,
          toRank: nextRank.currentRank,
          xp: profile.xp,
        },
      });
    }
    return {
      awarded: Boolean(created),
      profile: profile ? this.profileResponse(profile) : null,
    };
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
    const initialProfile = await this.recalculate(userId);
    await this.ensureAchievementBackfill(userId, initialProfile);
    const profile = await this.recalculate(userId);
    if (!profile) return null;
    const latestOwnership = await this.userBadges
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
    const latestBadge = latestOwnership
      ? await this.badges
          .findById(latestOwnership.badgeId)
          .select('name code slug iconKey')
          .lean()
          .exec()
      : null;
    const totalBadges = await this.badges.countDocuments({ active: true });
    return {
      ...this.profileResponse(profile),
      badgeSummary: {
        earned: profile.badgesCount,
        total: totalBadges,
        latest:
          latestBadge && latestOwnership
            ? {
                earnedAt: latestOwnership.createdAt,
                badge: latestBadge,
              }
            : null,
      },
    };
  }

  async backfillExistingUsers() {
    let cursor: Types.ObjectId | undefined;
    let processed = 0;
    do {
      const users = await this.users
        .find({
          status: UserStatus.ACTIVE,
          deletedAt: { $exists: false },
          ...(cursor ? { _id: { $gt: cursor } } : {}),
        })
        .select('_id')
        .sort({ _id: 1 })
        .limit(50)
        .lean()
        .exec();
      if (!users.length) break;
      for (const user of users) {
        const profile = await this.recalculate(user._id.toString());
        await this.ensureAchievementBackfill(user._id.toString(), profile);
        processed += 1;
      }
      cursor = users.at(-1)?._id;
      if (users.length < 50) break;
    } while (cursor);
    return { processed };
  }

  async listTransactions(userId: string, query: RewardTransactionQueryDto) {
    const records = await this.transactions
      .find({
        userId: new Types.ObjectId(userId),
        ...(query.cursor
          ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
          : {}),
      })
      .select('-createdBy')
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > query.limit;
    const page = records.slice(0, query.limit);
    return {
      items: page,
      pagination: {
        nextCursor: hasNextPage ? page.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  async listBadges(query: BadgeCatalogQueryDto, userId?: string) {
    const earned = userId
      ? await this.userBadges
          .find({ userId: new Types.ObjectId(userId) })
          .select('badgeId badgeCode createdAt context')
          .lean()
          .exec()
      : [];
    const earnedById = new Map(
      earned.map((item) => [item.badgeId.toString(), item] as const),
    );
    const earnedIds = new Set(earnedById.keys());
    const filter = this.badgeFilter(query, true);
    if (userId && query.earned !== BadgeEarnedFilter.ALL) {
      const ids = [...earnedIds].map((id) => new Types.ObjectId(id));
      filter._id = {
        ...(query.cursor ? { $lt: new Types.ObjectId(query.cursor) } : {}),
        [query.earned === BadgeEarnedFilter.EARNED ? '$in' : '$nin']: ids,
      };
    }
    const records = await this.badges
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const result = this.page(records, query.limit);
    const [activities, gamificationProfile] = userId
      ? await Promise.all([
          this.transactions
            .find({ userId: new Types.ObjectId(userId) })
            .select('type metadata')
            .lean()
            .exec(),
          this.profiles.findOne({ userId: new Types.ObjectId(userId) }).lean(),
        ])
      : [[], null];
    return {
      ...result,
      items: result.items.map((badge) => {
        const owned = earnedById.get(badge._id.toString());
        return {
          ...badge,
          ...(userId
            ? {
                earned: Boolean(owned),
                earnedAt: owned?.createdAt ?? null,
                progress: this.badgeProgress(
                  badge,
                  activities,
                  Boolean(owned),
                  gamificationProfile?.longestStreak ?? 0,
                ),
              }
            : {}),
        };
      }),
    };
  }

  async listBadgesAdmin(query: BadgeAdminQueryDto) {
    const records = await this.badges
      .find(this.badgeFilter(query, false))
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    return this.page(records, query.limit);
  }

  async getBadgeAdmin(id: string) {
    const badge = await this.badges.findById(id).lean().exec();
    if (!badge)
      throw new NotFoundException(
        'The badge could not be found',
        'BADGE_NOT_FOUND',
      );
    return badge;
  }

  async createBadge(actor: AuthUser, dto: CreateBadgeDto, requestId: string) {
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
      const badge = await this.badges.create({
        ...dto,
        active: dto.active ?? true,
        createdBy: new Types.ObjectId(actor.userId),
      });
      await this.audit.record({
        actor,
        action: 'BADGE_CREATED',
        resourceType: 'BADGE',
        resourceId: badge.id,
        requestId,
        reason: 'Created a new gamification badge definition',
        safeAfter: { name: badge.name, slug: badge.slug, active: badge.active },
      });
      return badge;
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The badge slug already exists',
          'BADGE_SLUG_CONFLICT',
        );
      throw error;
    }
  }

  async updateBadge(
    id: string,
    actor: AuthUser,
    dto: UpdateBadgeDto,
    requestId: string,
  ) {
    const badge = await this.badges.findById(id).exec();
    if (!badge)
      throw new NotFoundException(
        'The badge could not be found',
        'BADGE_NOT_FOUND',
      );
    const before = { name: badge.name, active: badge.active };
    badge.set(dto);
    await badge.save();
    await this.audit.record({
      actor,
      action: 'BADGE_UPDATED',
      resourceType: 'BADGE',
      resourceId: id,
      requestId,
      reason: 'Updated a gamification badge definition',
      safeBefore: before,
      safeAfter: { name: badge.name, active: badge.active },
    });
    return badge;
  }

  async archiveBadge(
    id: string,
    actor: AuthUser,
    reason: string,
    requestId: string,
  ) {
    const badge = await this.badges.findById(id).exec();
    if (!badge)
      throw new NotFoundException(
        'The badge could not be found',
        'BADGE_NOT_FOUND',
      );
    badge.active = false;
    await badge.save();
    await this.audit.record({
      actor,
      action: 'BADGE_ARCHIVED',
      resourceType: 'BADGE',
      resourceId: id,
      requestId,
      reason,
      safeAfter: { active: false },
    });
    return badge;
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
          achievementRank: calculateRankProgress(score.xp).currentRank,
          achievementRankLabel: calculateRankProgress(score.xp)
            .currentRankLabel,
        };
      });
  }

  async recordEvidenceInspection(
    userId: string,
    reportId: string,
    evidenceId: string,
  ) {
    return this.award(userId, {
      type: RewardTransactionType.EVIDENCE_INSPECTED,
      idempotencyReference: `evidence-inspected:${reportId}:${evidenceId}`,
      xp: 0,
      truthPoints: 0,
      metadata: { reportId, evidenceId },
    });
  }

  async claimCelebrations(userId: string) {
    const claimToken = randomUUID();
    const claimedAt = new Date();
    const expired = new Date(claimedAt.getTime() - 5 * 60_000);
    const events: AchievementEvent[] = [];
    for (let count = 0; count < 3; count += 1) {
      const event = await this.achievementEvents
        .findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            celebrationSeenAt: { $exists: false },
            $or: [
              { celebrationClaimedAt: { $exists: false } },
              { celebrationClaimedAt: { $lt: expired } },
            ],
          },
          {
            $set: {
              celebrationClaimedAt: claimedAt,
              celebrationClaimToken: claimToken,
            },
          },
          { returnDocument: 'after', sort: { createdAt: 1, _id: 1 } },
        )
        .lean()
        .exec();
      if (!event) break;
      events.push(event);
    }
    return { claimToken, celebrations: events };
  }

  async acknowledgeCelebration(userId: string, id: string, claimToken: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException(
        'The achievement celebration could not be found',
        'ACHIEVEMENT_CELEBRATION_NOT_FOUND',
      );
    const event = await this.achievementEvents.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
        celebrationClaimToken: claimToken,
        celebrationSeenAt: { $exists: false },
      },
      { $set: { celebrationSeenAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!event)
      throw new NotFoundException(
        'The achievement celebration is no longer available',
        'ACHIEVEMENT_CELEBRATION_NOT_FOUND',
      );
    return { acknowledged: true, celebrationId: event.id };
  }

  private async createTransaction(userId: string, input: RewardInput) {
    try {
      return await this.transactions.create({
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
    } catch (error) {
      if (this.isDuplicate(error)) return null;
      throw error;
    }
  }

  private badgeFilter(
    query: BadgeQueryDto & { active?: boolean },
    activeOnly: boolean,
  ) {
    const filter: Record<string, unknown> = {
      ...(activeOnly
        ? { active: true }
        : query.active !== undefined
          ? { active: query.active }
          : {}),
      ...(query.cursor
        ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
        : {}),
    };
    if (query.category) filter.category = searchPattern(query.category);
    if (query.rarity) filter.rarity = searchPattern(query.rarity);
    if (query.search) {
      const pattern = searchPattern(query.search);
      filter.$or = [
        { name: pattern },
        { description: pattern },
        { slug: pattern },
      ];
    }
    return filter;
  }

  private page<T extends { _id: Types.ObjectId }>(records: T[], limit: number) {
    const hasNextPage = records.length > limit;
    const items = records.slice(0, limit);
    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? items.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit,
      },
    };
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
          level: this.rankLevel(xp),
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
    context: {
      celebrate: boolean;
      sourceActivityType?: string;
      sourceActivityId?: string;
    },
  ) {
    if (!profile) return;
    const badges = await this.badges.find({ active: true }).lean().exec();
    const activities = await this.transactions
      .find({ userId: new Types.ObjectId(userId) })
      .select('type metadata')
      .lean()
      .exec();
    for (const badge of badges) {
      if (badge.availability === BadgeAvailability.COMING_SOON) continue;
      const progress = this.badgeProgress(
        badge,
        activities,
        false,
        profile.longestStreak,
      );
      if (!progress.measurable || progress.current < progress.target) continue;
      const threshold = progress.target;
      const reference = `badge:${badge._id.toString()}`;
      try {
        await this.userBadges.create({
          userId: new Types.ObjectId(userId),
          badgeId: badge._id,
          ...(badge.code ? { badgeCode: badge.code } : {}),
          idempotencyReference: reference,
          context: {
            criteriaType: badge.criteriaType,
            threshold,
            sourceActivityType: context.sourceActivityType,
            sourceActivityId: context.sourceActivityId,
          },
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
        metadata: {
          badgeId: badge._id.toString(),
          badgeCode: badge.code,
          badgeName: badge.name,
        },
      });
      if (!context.celebrate) continue;
      await this.createAchievementEvent({
        userId,
        type: AchievementEventType.BADGE_EARNED,
        idempotencyReference: `badge-earned:${badge._id.toString()}`,
        badgeId: badge._id,
        ...(badge.code ? { badgeCode: badge.code } : {}),
        badgeName: badge.name,
        ...(context.sourceActivityType
          ? { sourceActivityType: context.sourceActivityType }
          : {}),
        ...(context.sourceActivityId
          ? { sourceActivityId: context.sourceActivityId }
          : {}),
        metadata: {
          description: badge.description,
          whyItMatters: badge.whyItMatters,
          iconKey: badge.iconKey,
          xp: Number(badge.reward.xp ?? 0),
          truthPoints: Number(badge.reward.truthPoints ?? 0),
          currentRank: calculateRankProgress(profile.xp).currentRank,
        },
      });
      await this.notifications.dispatch({
        userId,
        type: NotificationType.BADGE_EARNED,
        title: `Badge earned: ${badge.name}`,
        message: badge.description,
        actionUrl: '/app/achievements',
        idempotencyReference: `badge-earned:${badge._id.toString()}`,
        metadata: {
          badgeId: badge._id.toString(),
          badgeSlug: badge.slug,
          badgeName: badge.name,
        },
      });
    }
  }

  private async ensureAchievementBackfill(
    userId: string,
    profile: (GamificationProfile & { save?: () => Promise<unknown> }) | null,
  ) {
    if (
      !profile ||
      profile.achievementCatalogVersion >= ACHIEVEMENT_CATALOG_VERSION
    )
      return profile;
    await this.evaluateBadges(userId, profile, { celebrate: false });
    await this.profiles.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { achievementCatalogVersion: ACHIEVEMENT_CATALOG_VERSION } },
    );
    return this.recalculate(userId);
  }

  private badgeProgress(
    badge: Badge,
    activities: Array<{
      type: RewardTransactionType;
      metadata: Record<string, unknown>;
    }>,
    earned: boolean,
    longestStreak: number,
  ) {
    const target = Math.max(1, Number(badge.criteria.threshold) || 1);
    if (badge.availability === BadgeAvailability.COMING_SOON)
      return {
        measurable: false,
        current: 0,
        target,
        percentage: 0,
        label: 'Coming soon',
      };
    let current = 0;
    const transactionType = this.badgeTransactionType(badge.criteriaType);
    if (transactionType)
      current = activities.filter(
        (item) => item.type === transactionType,
      ).length;
    if (badge.criteriaType === BadgeCriteriaType.DAILY_STREAK)
      current = longestStreak;
    if (badge.criteriaType === BadgeCriteriaType.EVIDENCE_INSPECTION_COUNT)
      current = activities.filter(
        (item) => item.type === RewardTransactionType.EVIDENCE_INSPECTED,
      ).length;
    if (badge.criteriaType === BadgeCriteriaType.GUIDED_INVESTIGATION_COUNT)
      current = activities.filter(
        (item) =>
          item.type === RewardTransactionType.VERIFICATION_COMPLETED &&
          item.metadata.mode === InvestigationMode.GUIDED,
      ).length;
    if (badge.criteriaType === BadgeCriteriaType.MISSION_COUNT)
      current = activities.filter(
        (item) => item.type === RewardTransactionType.MISSION_COMPLETED,
      ).length;
    if (badge.criteriaType === BadgeCriteriaType.TAGGED_ACTIVITY_COUNT) {
      const tags = Array.isArray(badge.criteria.tags)
        ? badge.criteria.tags.filter(
            (tag): tag is string => typeof tag === 'string',
          )
        : [];
      current = activities.filter((item) => {
        const activityTags = Array.isArray(item.metadata.tags)
          ? item.metadata.tags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : [];
        return tags.some((tag) => activityTags.includes(tag));
      }).length;
    }
    if (earned) current = Math.max(current, target);
    return {
      measurable: true,
      current,
      target,
      percentage: Math.min(100, Math.round((current / target) * 100)),
      label: earned ? 'Earned' : `${Math.min(current, target)} of ${target}`,
    };
  }

  private profileResponse(profile: GamificationProfile) {
    return {
      userId: profile.userId,
      xp: profile.xp,
      truthPoints: profile.truthPoints,
      level: profile.level,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      lastEligibleActivityDate: profile.lastEligibleActivityDate ?? null,
      badgesCount: profile.badgesCount,
      leaderboardEligible: profile.leaderboardEligible,
      achievementCatalogVersion: profile.achievementCatalogVersion,
      rank: calculateRankProgress(profile.xp),
    };
  }

  private rankLevel(xp: number) {
    return (
      RANK_THRESHOLDS.findIndex(
        (rank) => rank.code === calculateRankProgress(xp).currentRank,
      ) + 1
    );
  }

  private async createAchievementEvent(input: {
    userId: string;
    type: AchievementEventType;
    idempotencyReference: string;
    badgeId?: Types.ObjectId;
    badgeCode?: string;
    badgeName?: string;
    fromRank?: ReturnType<typeof calculateRankProgress>['currentRank'];
    toRank?: ReturnType<typeof calculateRankProgress>['currentRank'];
    sourceActivityType?: string;
    sourceActivityId?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      return await this.achievementEvents.create({
        ...input,
        userId: new Types.ObjectId(input.userId),
      });
    } catch (error) {
      if (this.isDuplicate(error)) return null;
      throw error;
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
