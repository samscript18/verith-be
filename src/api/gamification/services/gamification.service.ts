import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
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
  AchievementBackfillDto,
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
import { FIXED_BADGE_CATALOG } from '../constants/badge-catalog';
import { InvestigationMode } from '../../verifications/enums/investigation-mode.enum';
import type { RewardInput } from '../interfaces/reward-input.interface';
import { GamificationReconciliationService } from './gamification-reconciliation.service';

const ELIGIBLE_DAILY_ACTIVITY_TYPES = [
  RewardTransactionType.VERIFICATION_COMPLETED,
  RewardTransactionType.LESSON_COMPLETED,
  RewardTransactionType.QUIZ_PASSED,
  RewardTransactionType.CHALLENGE_COMPLETED,
  RewardTransactionType.MISSION_COMPLETED,
] as const;

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
    private readonly reconciliation: GamificationReconciliationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async award(userId: string, input: RewardInput) {
    const initialBaseline = await this.recalculate(userId);
    const baseline = await this.ensureAchievementBackfill(
      userId,
      initialBaseline,
      input.idempotencyReference,
    );
    const previousXp = baseline?.xp ?? 0;
    const created = await this.createTransaction(userId, {
      ...input,
      metadata: {
        ...(input.metadata ?? {}),
        rankBaselineXp: previousXp,
      },
    });
    const sourceTransaction =
      created ??
      (await this.transactions
        .findOne({
          userId: new Types.ObjectId(userId),
          idempotencyReference: input.idempotencyReference,
        })
        .exec());
    if (!sourceTransaction)
      throw new ConflictException(
        'The reward could not be resolved after an idempotent retry',
        'REWARD_TRANSACTION_NOT_RESOLVED',
      );
    await this.ensureDailyActivityForReward(
      userId,
      input.type,
      sourceTransaction.createdAt ?? input.occurredAt ?? new Date(),
      sourceTransaction._id.toString(),
    );
    let profile = await this.recalculate(userId);
    // Re-evaluating is intentional: it repairs an interrupted badge award
    // after ownership was written but a later side effect did not complete.
    await this.evaluateBadges(userId, profile, {
      celebrate: true,
      sourceActivityId: sourceTransaction._id.toString(),
      sourceActivityType: input.type,
    });
    profile = await this.recalculate(userId);
    const storedBaseline = Number(sourceTransaction.metadata?.rankBaselineXp);
    const previousRank = calculateRankProgress(
      Number.isFinite(storedBaseline) ? storedBaseline : previousXp,
    );
    const nextRank = calculateRankProgress(profile?.xp ?? previousXp);
    if (
      profile &&
      previousRank.currentRank !== nextRank.currentRank &&
      nextRank.currentXp > previousRank.currentXp
    ) {
      const rankReference = `rank-up:${nextRank.currentRank}`;
      await this.createAchievementEvent({
        userId,
        type: AchievementEventType.RANK_UP,
        idempotencyReference: rankReference,
        fromRank: previousRank.currentRank,
        toRank: nextRank.currentRank,
        sourceActivityType: input.type,
        sourceActivityId: sourceTransaction._id.toString(),
        metadata: {
          currentXp: nextRank.currentXp,
          currentRankLabel: nextRank.currentRankLabel,
        },
      });
      await this.notifications.dispatch({
        userId,
        type: NotificationType.LEVEL_UP,
        title: `You reached ${nextRank.currentRankLabel}`,
        message: 'Your Verith activity moved you into a new achievement rank.',
        actionUrl: '/app/achievements',
        idempotencyReference: rankReference,
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
    const objectId = new Types.ObjectId(userId);
    let profile: GamificationProfile | null = await this.recalculate(userId);
    if (profile.achievementCatalogVersion < ACHIEVEMENT_CATALOG_VERSION) {
      profile = await this.ensureAchievementBackfill(userId, profile);
    } else {
      const recovery = await this.repairDurableActivityRewards(userId);
      if (recovery.created > 0) {
        profile = await this.recalculate(userId);
        await this.evaluateBadges(userId, profile, {
          celebrate: true,
          ...(recovery.latestSourceActivityType
            ? { sourceActivityType: recovery.latestSourceActivityType }
            : {}),
          ...(recovery.latestSourceActivityId
            ? { sourceActivityId: recovery.latestSourceActivityId }
            : {}),
        });
        profile = await this.recalculate(userId);
      }
    }
    profile ??= await this.recalculate(userId);
    const [ownerships, activeBadges] = await Promise.all([
      this.userBadges
        .find({ userId: objectId })
        .select('badgeId badgeCode createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .lean()
        .exec(),
      this.badges
        .find({ active: true })
        .select('_id code name slug iconKey')
        .sort({ sortOrder: 1, _id: 1 })
        .lean()
        .exec(),
    ]);
    const activeById = new Map(
      activeBadges.map((badge) => [badge._id.toString(), badge] as const),
    );
    const activeByCode = new Map(
      activeBadges.flatMap((badge) =>
        badge.code ? [[badge.code, badge] as const] : [],
      ),
    );
    const activeOwnerships = ownerships.flatMap((ownership) => {
      const badge =
        activeById.get(ownership.badgeId.toString()) ??
        (ownership.badgeCode
          ? activeByCode.get(ownership.badgeCode)
          : undefined);
      return badge ? [{ ownership, badge }] : [];
    });
    const latest = activeOwnerships.at(0) ?? null;
    return {
      ...this.profileResponse(profile),
      badgeSummary: {
        earned: activeOwnerships.length,
        total: activeBadges.length,
        latest: latest
          ? {
              earnedAt: latest.ownership.createdAt,
              badge: latest.badge,
            }
          : null,
      },
    };
  }

  async backfillExistingUsers(
    actor: AuthUser,
    dto: AchievementBackfillDto,
    requestId: string,
  ) {
    const cursor = dto.cursor ? new Types.ObjectId(dto.cursor) : undefined;
    let processed = 0;
    let skipped = 0;
    const records = await this.users
      .find({
        status: UserStatus.ACTIVE,
        deletedAt: { $exists: false },
        ...(cursor ? { _id: { $gt: cursor } } : {}),
      })
      .select('_id')
      .sort({ _id: 1 })
      .limit(dto.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > dto.limit;
    const users = records.slice(0, dto.limit);
    for (const user of users) {
      const existing = await this.profiles
        .findOne({ userId: user._id })
        .select('achievementCatalogVersion')
        .exec();
      if (
        existing &&
        existing.achievementCatalogVersion >= ACHIEVEMENT_CATALOG_VERSION
      ) {
        skipped += 1;
        continue;
      }
      const profile = existing ?? (await this.recalculate(user._id.toString()));
      await this.ensureAchievementBackfill(user._id.toString(), profile);
      processed += 1;
    }
    const nextCursor = hasNextPage
      ? (users.at(-1)?._id.toString() ?? null)
      : null;
    await this.audit.record({
      actor,
      action: 'GAMIFICATION_ACHIEVEMENT_BACKFILL_EXECUTED',
      resourceType: 'GAMIFICATION',
      resourceId: `achievement-catalog-v${ACHIEVEMENT_CATALOG_VERSION}`,
      requestId,
      reason: dto.reason,
      safeBefore: { cursor: dto.cursor ?? null, limit: dto.limit },
      safeAfter: {
        scanned: users.length,
        processed,
        skipped,
        nextCursor,
        hasNextPage,
      },
    });
    return {
      processed,
      skipped,
      scanned: users.length,
      pagination: {
        nextCursor,
        previousCursor: null,
        hasNextPage,
        limit: dto.limit,
      },
    };
  }

  async listTransactions(userId: string, query: RewardTransactionQueryDto) {
    const objectUserId = new Types.ObjectId(userId);
    const filter: Record<string, unknown> = { userId: objectUserId };
    if (query.cursor) {
      const anchor = await this.transactions
        .findOne({
          _id: new Types.ObjectId(query.cursor),
          userId: objectUserId,
        })
        .select('_id createdAt')
        .lean()
        .exec();
      if (!anchor)
        throw new ValidationException(
          'The reward ledger pagination cursor is no longer valid',
        );
      filter.$or = [
        { createdAt: { $lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
      ];
    }
    const records = await this.transactions
      .find(filter)
      .select('-createdBy')
      .sort({ createdAt: -1, _id: -1 })
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
    let authoritativeProfile: GamificationProfile | null = null;
    if (userId) {
      authoritativeProfile = await this.recalculate(userId);
      if (
        authoritativeProfile.achievementCatalogVersion <
        ACHIEVEMENT_CATALOG_VERSION
      ) {
        authoritativeProfile = await this.ensureAchievementBackfill(
          userId,
          authoritativeProfile,
        );
      } else {
        const recovery = await this.repairDurableActivityRewards(userId);
        if (recovery.created > 0) {
          authoritativeProfile = await this.recalculate(userId);
          await this.evaluateBadges(userId, authoritativeProfile, {
            celebrate: true,
            ...(recovery.latestSourceActivityType
              ? { sourceActivityType: recovery.latestSourceActivityType }
              : {}),
            ...(recovery.latestSourceActivityId
              ? { sourceActivityId: recovery.latestSourceActivityId }
              : {}),
          });
          authoritativeProfile = await this.recalculate(userId);
        }
      }
    }
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
    const earnedByCode = new Map(
      earned.flatMap((item) =>
        item.badgeCode ? [[item.badgeCode, item] as const] : [],
      ),
    );
    if (earnedByCode.size) {
      const currentDefinitions = await this.badges
        .find({ code: { $in: [...earnedByCode.keys()] } })
        .select('_id code')
        .lean()
        .exec();
      for (const definition of currentDefinitions) {
        const ownership = definition.code
          ? earnedByCode.get(definition.code)
          : undefined;
        if (ownership) earnedById.set(definition._id.toString(), ownership);
      }
    }
    const earnedIds = new Set(earnedById.keys());
    const filter = this.badgeFilter(query, true);
    if (userId && query.earned !== BadgeEarnedFilter.ALL) {
      const ids = [...earnedIds].map((id) => new Types.ObjectId(id));
      filter._id = {
        [query.earned === BadgeEarnedFilter.EARNED ? '$in' : '$nin']: ids,
      };
    }
    await this.applyBadgeCursor(filter, query.cursor);
    const records = await this.badges
      .find(filter)
      .sort({ sortOrder: 1, _id: 1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const result = this.page(records, query.limit);
    const activities = userId
      ? await this.transactions
          .find({ userId: new Types.ObjectId(userId) })
          .select('type metadata')
          .lean()
          .exec()
      : [];
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
                  authoritativeProfile?.longestStreak ?? 0,
                ),
              }
            : {}),
        };
      }),
    };
  }

  async listBadgesAdmin(query: BadgeAdminQueryDto) {
    const filter = this.badgeFilter(query, false);
    await this.applyBadgeCursor(filter, query.cursor);
    const records = await this.badges
      .find(filter)
      .sort({ sortOrder: 1, _id: 1 })
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
    this.validateBadgeDefinition(dto.criteriaType, dto.criteria, dto.reward);
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
    const fixed = FIXED_BADGE_CATALOG.some(
      (definition) =>
        definition.code === badge.code || definition.slug === badge.slug,
    );
    if (fixed && Object.keys(dto).some((key) => key !== 'active'))
      throw new ValidationException(
        'Fixed badge definitions cannot be changed; only their active state may be updated',
      );
    this.validateBadgeDefinition(
      dto.criteriaType ?? badge.criteriaType,
      dto.criteria ?? badge.criteria,
      dto.reward ?? badge.reward,
    );
    badge.set(dto);
    try {
      await badge.save();
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The badge slug already exists',
          'BADGE_SLUG_CONFLICT',
        );
      throw error;
    }
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
    if (since) {
      match.createdAt = { $gte: since };
      match['metadata.reconciledFromHistory'] = { $ne: true };
    }
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
    sourceUrl?: string,
  ) {
    const sourceFingerprint = this.evidenceSourceFingerprint(
      sourceUrl,
      reportId,
      evidenceId,
    );
    const objectUserId = new Types.ObjectId(userId);
    const legacyReference = `evidence-inspected:${reportId}:${evidenceId}`;
    const sourceReference = `evidence-inspected:${sourceFingerprint}`;
    const existing = await this.transactions
      .findOne({
        userId: objectUserId,
        idempotencyReference: { $in: [legacyReference, sourceReference] },
      })
      .exec();
    if (existing && typeof existing.metadata.sourceFingerprint !== 'string') {
      existing.metadata = { ...existing.metadata, sourceFingerprint };
      await existing.save();
    }
    return this.award(userId, {
      type: RewardTransactionType.EVIDENCE_INSPECTED,
      idempotencyReference: existing?.idempotencyReference ?? sourceReference,
      xp: 0,
      truthPoints: 0,
      metadata: { reportId, evidenceId, sourceFingerprint },
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
    if (
      !input.idempotencyReference.trim() ||
      input.idempotencyReference.length > 300 ||
      !Number.isInteger(input.xp) ||
      !Number.isInteger(input.truthPoints) ||
      (![
        RewardTransactionType.ADMIN_ADJUSTMENT,
        RewardTransactionType.REVERSAL,
      ].includes(input.type) &&
        (input.xp < 0 || input.truthPoints < 0))
    )
      throw new ValidationException(
        'Reward amounts and idempotency references must satisfy the recorded reward policy',
      );
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
        ...(input.occurredAt
          ? { createdAt: input.occurredAt, updatedAt: input.occurredAt }
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

  private async applyBadgeCursor(
    filter: Record<string, unknown>,
    cursor?: string,
  ): Promise<void> {
    if (!cursor) return;
    const anchor = await this.badges
      .findById(cursor)
      .select('_id sortOrder')
      .lean()
      .exec();
    if (!anchor)
      throw new ValidationException(
        'The badge pagination cursor is no longer valid',
      );
    const sortOrder = Number(anchor.sortOrder ?? 100);
    filter.$and = [
      ...((filter.$and as unknown[] | undefined) ?? []),
      {
        $or: [
          { sortOrder: { $gt: sortOrder } },
          { sortOrder, _id: { $gt: anchor._id } },
        ],
      },
    ];
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
      transactionCount: number;
    }>([
      { $match: { userId: objectId } },
      {
        $group: {
          _id: null,
          xp: { $sum: '$xp' },
          truthPoints: { $sum: '$truthPoints' },
          transactionCount: { $sum: 1 },
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
    const transactionCount = totals?.transactionCount ?? 0;
    const projection = {
      xp,
      truthPoints: Math.max(0, totals?.truthPoints ?? 0),
      level: this.rankLevel(xp),
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      ...(dates.at(-1)
        ? { lastEligibleActivityDate: dates.at(-1) as string }
        : {}),
      badgesCount,
      leaderboardEligible: user?.privacyPreferences.leaderboard !== false,
      projectionTransactionCount: transactionCount,
      projectionBadgeOwnershipCount: badgesCount,
    };
    const updated = await this.profiles.findOneAndUpdate(
      {
        userId: objectId,
        $or: [
          { projectionTransactionCount: { $exists: false } },
          { projectionTransactionCount: { $lt: transactionCount } },
          {
            projectionTransactionCount: transactionCount,
            projectionBadgeOwnershipCount: { $lte: badgesCount },
          },
        ],
      },
      {
        $set: projection,
      },
      { returnDocument: 'after' },
    );
    if (updated) return updated;
    const existing = await this.profiles.findOne({ userId: objectId }).exec();
    if (existing) return existing;
    try {
      return await this.profiles.create({ userId: objectId, ...projection });
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;
      const winner = await this.profiles.findOne({ userId: objectId }).exec();
      if (winner) return winner;
      throw error;
    }
  }

  private async ensureDailyActivityForReward(
    userId: string,
    type: RewardTransactionType,
    occurredAt: Date,
    sourceActivityId: string,
  ) {
    if (
      !ELIGIBLE_DAILY_ACTIVITY_TYPES.includes(
        type as (typeof ELIGIBLE_DAILY_ACTIVITY_TYPES)[number],
      )
    )
      return null;
    const activityDate = occurredAt.toISOString().slice(0, 10);
    return this.createTransaction(userId, {
      type: RewardTransactionType.DAILY_STREAK,
      idempotencyReference: `daily-streak:${activityDate}`,
      xp: 0,
      truthPoints: 0,
      occurredAt,
      metadata: {
        activityDate,
        sourceActivityType: type,
        sourceActivityId,
      },
    });
  }

  /**
   * Product records are the durable source of truth. This bounded, idempotent
   * read repair closes the commit-before-reward window without adding a queue:
   * if a producer committed and its synchronous reward write failed, the next
   * achievement read reconstructs only the missing ledger facts.
   */
  private async repairDurableActivityRewards(userId: string) {
    const rewards = await this.reconciliation.rewards(userId);
    let created = 0;
    let latestSourceActivityType: string | undefined;
    let latestSourceActivityId: string | undefined;
    for (const reward of rewards) {
      const transaction = await this.createTransaction(userId, {
        ...reward,
        metadata: {
          ...(reward.metadata ?? {}),
          reconciledFromHistory: false,
          recoveredFromDurableState: true,
        },
      });
      if (!transaction) continue;
      created += 1;
      latestSourceActivityType = reward.type;
      latestSourceActivityId = transaction._id.toString();
    }
    return {
      created,
      latestSourceActivityType,
      latestSourceActivityId,
    };
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
      const objectUserId = new Types.ObjectId(userId);
      let ownership: UserBadge | null = null;
      try {
        ownership = await this.userBadges.create({
          userId: objectUserId,
          badgeId: badge._id,
          ...(badge.code ? { badgeCode: badge.code } : {}),
          idempotencyReference: `badge:${badge._id.toString()}`,
          context: {
            criteriaType: badge.criteriaType,
            threshold,
            sourceActivityType: context.sourceActivityType,
            sourceActivityId: context.sourceActivityId,
            celebrationEligible: context.celebrate,
          },
        });
      } catch (error) {
        if (!this.isDuplicate(error)) throw error;
        ownership = await this.userBadges
          .findOne({
            userId: objectUserId,
            $or: [
              { badgeId: badge._id },
              ...(badge.code ? [{ badgeCode: badge.code }] : []),
            ],
          })
          .exec();
      }
      if (!ownership) continue;
      const canonicalBadgeId = ownership.badgeId.toString();
      const reference = `badge:${canonicalBadgeId}`;
      await this.createTransaction(userId, {
        type: RewardTransactionType.BADGE_EARNED,
        idempotencyReference: reference,
        xp: Number(badge.reward.xp ?? 0),
        truthPoints: Number(badge.reward.truthPoints ?? 0),
        metadata: {
          badgeId: badge._id.toString(),
          badgeCode: badge.code,
          badgeName: badge.name,
          reconciledFromHistory:
            ownership.context?.celebrationEligible !== true,
        },
      });
      const ownershipContext = ownership.context ?? {};
      if (ownershipContext.celebrationEligible !== true) continue;
      const currentProfile = await this.recalculate(userId);
      const sourceActivityType =
        typeof ownershipContext.sourceActivityType === 'string'
          ? ownershipContext.sourceActivityType
          : context.sourceActivityType;
      const sourceActivityId =
        typeof ownershipContext.sourceActivityId === 'string'
          ? ownershipContext.sourceActivityId
          : context.sourceActivityId;
      await this.createAchievementEvent({
        userId,
        type: AchievementEventType.BADGE_EARNED,
        idempotencyReference: `badge-earned:${canonicalBadgeId}`,
        badgeId: ownership.badgeId,
        ...(badge.code ? { badgeCode: badge.code } : {}),
        badgeName: badge.name,
        ...(sourceActivityType ? { sourceActivityType } : {}),
        ...(sourceActivityId ? { sourceActivityId } : {}),
        metadata: {
          description: badge.description,
          whyItMatters: badge.whyItMatters,
          iconKey: badge.iconKey,
          xp: Number(badge.reward.xp ?? 0),
          truthPoints: Number(badge.reward.truthPoints ?? 0),
          currentRank: calculateRankProgress(currentProfile?.xp ?? profile.xp)
            .currentRank,
        },
      });
      await this.notifications.dispatch({
        userId,
        type: NotificationType.BADGE_EARNED,
        title: `Badge earned: ${badge.name}`,
        message: badge.description,
        actionUrl: '/app/achievements',
        idempotencyReference: `badge-earned:${canonicalBadgeId}`,
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
    activeRewardReference?: string,
  ) {
    if (
      !profile ||
      profile.achievementCatalogVersion >= ACHIEVEMENT_CATALOG_VERSION
    )
      return profile;
    // The activity currently being awarded is not historical data. Including
    // it here would let the quiet migration path earn its badge before the live
    // award can create an unseen celebration event.
    const rewards = await this.reconciliation.rewards(
      userId,
      activeRewardReference,
    );
    for (const reward of rewards) await this.createTransaction(userId, reward);
    await this.repairRecentFirstCheckCelebration(userId);
    const reconciledProfile = await this.recalculate(userId);
    await this.evaluateBadges(userId, reconciledProfile, { celebrate: false });
    await this.profiles.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { achievementCatalogVersion: ACHIEVEMENT_CATALOG_VERSION } },
    );
    return this.recalculate(userId);
  }

  /**
   * Catalog v2 could classify the first live completion as historical. Repair
   * only ownership written within five minutes of that verification, which
   * separates the live race from ordinary historical backfills without
   * replaying launch-day celebrations for established users.
   */
  private async repairRecentFirstCheckCelebration(userId: string) {
    const badge = await this.badges
      .findOne({ code: 'FIRST_CHECK', active: true })
      .select('_id')
      .lean()
      .exec();
    if (!badge) return;
    const objectUserId = new Types.ObjectId(userId);
    const ownership = await this.userBadges
      .findOne({
        userId: objectUserId,
        $or: [{ badgeId: badge._id }, { badgeCode: 'FIRST_CHECK' }],
        'context.celebrationEligible': { $exists: false },
      })
      .exec();
    if (!ownership?.createdAt) return;
    const reward = await this.transactions
      .findOne({
        userId: objectUserId,
        type: RewardTransactionType.VERIFICATION_COMPLETED,
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (!reward) return;
    const verificationId =
      typeof reward.metadata.verificationId === 'string'
        ? reward.metadata.verificationId
        : undefined;
    const verification = verificationId
      ? await this.reconciliation.verificationCompletion(verificationId, userId)
      : null;
    const completionTime = verification?.getTime();
    if (
      !completionTime ||
      Math.abs(ownership.createdAt.getTime() - completionTime) > 5 * 60_000
    )
      return;
    await this.userBadges.updateOne(
      {
        _id: ownership._id,
        'context.celebrationEligible': { $exists: false },
      },
      {
        $set: {
          'context.celebrationEligible': true,
          'context.sourceActivityType':
            RewardTransactionType.VERIFICATION_COMPLETED,
          'context.sourceActivityId': reward._id.toString(),
          'context.repairedRecentLiveAward': true,
        },
      },
    );
    ownership.context = {
      ...ownership.context,
      celebrationEligible: true,
      sourceActivityType: RewardTransactionType.VERIFICATION_COMPLETED,
      sourceActivityId: reward._id.toString(),
      repairedRecentLiveAward: true,
    };
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
    const rawTarget = Number(badge.criteria.threshold);
    const target = Number.isInteger(rawTarget) && rawTarget > 0 ? rawTarget : 1;
    if (badge.availability === BadgeAvailability.COMING_SOON)
      return {
        measurable: false,
        current: 0,
        target,
        percentage: 0,
        label: 'Coming soon',
      };
    const supported = new Set<BadgeCriteriaType>([
      BadgeCriteriaType.VERIFICATION_COUNT,
      BadgeCriteriaType.LESSON_COUNT,
      BadgeCriteriaType.CHALLENGE_STREAK,
      BadgeCriteriaType.DAILY_STREAK,
      BadgeCriteriaType.EVIDENCE_INSPECTION_COUNT,
      BadgeCriteriaType.TAGGED_ACTIVITY_COUNT,
      BadgeCriteriaType.GUIDED_INVESTIGATION_COUNT,
      BadgeCriteriaType.MISSION_COUNT,
    ]);
    if (!supported.has(badge.criteriaType) || rawTarget !== target)
      return {
        measurable: false,
        current: earned ? target : 0,
        target,
        percentage: earned ? 100 : 0,
        label: earned ? 'Earned' : 'Complete the required activity to unlock.',
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
      current = new Set(
        activities
          .filter(
            (item) => item.type === RewardTransactionType.EVIDENCE_INSPECTED,
          )
          .map((item) => {
            if (typeof item.metadata.sourceFingerprint === 'string')
              return item.metadata.sourceFingerprint;
            const reportId =
              typeof item.metadata.reportId === 'string'
                ? item.metadata.reportId
                : '';
            const evidenceId =
              typeof item.metadata.evidenceId === 'string'
                ? item.metadata.evidenceId
                : '';
            return `${reportId}:${evidenceId}`;
          }),
      ).size;
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
        ? badge.criteria.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean)
        : [];
      if (!tags.length)
        return {
          measurable: false,
          current: earned ? target : 0,
          target,
          percentage: earned ? 100 : 0,
          label: earned
            ? 'Earned'
            : 'Complete the required activity to unlock.',
        };
      current = activities.filter((item) => {
        const activityTags = Array.isArray(item.metadata.tags)
          ? item.metadata.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
          : [];
        return tags.some((tag) => activityTags.includes(tag));
      }).length;
    }
    if (earned) current = Math.max(current, target);
    const progressLabel =
      badge.criteriaType === BadgeCriteriaType.DAILY_STREAK
        ? `Best streak: ${Math.min(current, target)} of ${target} consecutive days`
        : badge.criteriaType === BadgeCriteriaType.GUIDED_INVESTIGATION_COUNT
          ? `${Math.min(current, target)} of ${target} guided investigations completed`
          : badge.criteriaType === BadgeCriteriaType.EVIDENCE_INSPECTION_COUNT
            ? `${Math.min(current, target)} of ${target} evidence sources opened`
            : badge.criteriaType === BadgeCriteriaType.VERIFICATION_COUNT
              ? `${Math.min(current, target)} of ${target} investigations completed`
              : `${Math.min(current, target)} of ${target} qualifying activities`;
    return {
      measurable: true,
      current,
      target,
      percentage: Math.min(100, Math.round((current / target) * 100)),
      label: earned ? 'Earned' : progressLabel,
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

  private evidenceSourceFingerprint(
    sourceUrl: string | undefined,
    reportId: string,
    evidenceId: string,
  ): string {
    let identity = `report:${reportId}:evidence:${evidenceId}`;
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        url.hash = '';
        url.hostname = url.hostname.toLowerCase();
        for (const key of [...url.searchParams.keys()]) {
          if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
        }
        url.searchParams.sort();
        if (url.pathname.length > 1)
          url.pathname = url.pathname.replace(/\/+$/, '');
        identity = url.toString();
      } catch {
        // Malformed legacy URLs remain safely distinct within their report.
      }
    }
    return createHash('sha256').update(identity).digest('hex');
  }

  private validateBadgeDefinition(
    criteriaType: BadgeCriteriaType,
    criteria: Record<string, unknown>,
    reward: { xp?: number; truthPoints?: number },
  ): void {
    const supported = new Set<BadgeCriteriaType>([
      BadgeCriteriaType.VERIFICATION_COUNT,
      BadgeCriteriaType.LESSON_COUNT,
      BadgeCriteriaType.CHALLENGE_STREAK,
      BadgeCriteriaType.DAILY_STREAK,
      BadgeCriteriaType.EVIDENCE_INSPECTION_COUNT,
      BadgeCriteriaType.TAGGED_ACTIVITY_COUNT,
      BadgeCriteriaType.GUIDED_INVESTIGATION_COUNT,
      BadgeCriteriaType.MISSION_COUNT,
    ]);
    if (!supported.has(criteriaType))
      throw new ValidationException(
        'This badge criterion is not backed by measurable recorded activity',
      );
    const threshold = Number(criteria.threshold);
    const xp = Number(reward.xp ?? 0);
    const truthPoints = Number(reward.truthPoints ?? 0);
    if (
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      !Number.isInteger(xp) ||
      xp < 0 ||
      !Number.isInteger(truthPoints) ||
      truthPoints < 0
    )
      throw new ValidationException(
        'Badge thresholds and rewards must be valid non-negative integers',
      );
    if (criteriaType === BadgeCriteriaType.TAGGED_ACTIVITY_COUNT) {
      const tags = Array.isArray(criteria.tags)
        ? criteria.tags.filter(
            (tag): tag is string =>
              typeof tag === 'string' && Boolean(tag.trim()),
          )
        : [];
      if (!tags.length)
        throw new ValidationException(
          'Tagged activity badges require at least one measurable tag',
        );
    }
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
