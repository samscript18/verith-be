import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApplicationException } from '../../../core/exceptions';
import type { UsageConfig } from '../../../shared/config';
import { User } from '../../users/schemas/user.schema';
import { UsageReservationStatus } from '../enums/usage-reservation-status.enum';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import {
  DailyInvestigationUsage,
  type DailyInvestigationUsageDocument,
} from '../schemas/daily-investigation-usage.schema';
import type {
  VerificationDocument,
  VerificationUsageReservation,
} from '../schemas/verification.schema';
import { Verification } from '../schemas/verification.schema';
import { EntitlementService } from '../../entitlements/services/entitlement.service';
import { VerificationStatus } from '../enums/verification-status.enum';

export interface UsageReservationSnapshot {
  usageId: Types.ObjectId;
  verificationId: Types.ObjectId;
  attempt: number;
  dateKey: string;
  timezone: string;
  cost: number;
  status: UsageReservationStatus;
  resetAt: Date;
  transitionedAt?: Date;
}

@Injectable()
export class InvestigationUsageService {
  private readonly logger = new Logger(InvestigationUsageService.name);
  private readonly config: UsageConfig;

  constructor(
    @InjectModel(DailyInvestigationUsage.name)
    private readonly usages: Model<DailyInvestigationUsage>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
    configService: ConfigService,
    private readonly entitlements: EntitlementService,
  ) {
    this.config = configService.getOrThrow<UsageConfig>('usage');
  }

  async reserve(
    userId: string,
    verificationId: Types.ObjectId,
    sourceType: VerificationSourceType,
    attempt = 0,
  ): Promise<UsageReservationSnapshot> {
    const window = await this.windowForUser(userId);
    const userObjectId = new Types.ObjectId(userId);
    const entitlement = await this.entitlements.resolve(userId);
    const limit = entitlement.policy.dailyInvestigationLimit;
    const cost = this.costFor(
      sourceType,
      entitlement.policy.videoInvestigationCost,
    );
    await this.usages.updateOne(
      { userId: userObjectId, dateKey: window.dateKey },
      {
        $setOnInsert: {
          userId: userObjectId,
          dateKey: window.dateKey,
          timezone: window.timezone,
          used: 0,
          reserved: 0,
          released: 0,
          reservations: [],
        },
        $set: { limit },
      },
      { upsert: true },
    );

    const reservedAt = new Date();
    const usage = await this.usages
      .findOneAndUpdate(
        {
          userId: userObjectId,
          dateKey: window.dateKey,
          reservations: {
            $not: { $elemMatch: { verificationId, attempt } },
          },
          $expr: {
            $lte: [{ $add: ['$used', '$reserved', cost] }, '$limit'],
          },
        },
        {
          $inc: { reserved: cost },
          $push: {
            reservations: {
              verificationId,
              attempt,
              cost,
              status: UsageReservationStatus.RESERVED,
              reservedAt,
            },
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!usage) {
      const existing = await this.usages
        .findOne({
          userId: userObjectId,
          dateKey: window.dateKey,
          reservations: { $elemMatch: { verificationId, attempt } },
        })
        .exec();
      const reservation = existing?.reservations.find(
        (item) =>
          item.verificationId.toString() === verificationId.toString() &&
          (item.attempt ?? 0) === attempt,
      );
      if (existing && reservation) {
        return this.snapshot(existing, reservation, window.resetAt);
      }
      const current = await this.status(userId);
      throw new ApplicationException(
        'Your free investigation allowance is used for today',
        HttpStatus.TOO_MANY_REQUESTS,
        'DAILY_INVESTIGATION_LIMIT_REACHED',
        current,
      );
    }
    const reservation = usage.reservations.find(
      (item) =>
        item.verificationId.toString() === verificationId.toString() &&
        (item.attempt ?? 0) === attempt,
    );
    if (!reservation) throw new Error('Usage reservation was not saved');
    return this.snapshot(usage, reservation, window.resetAt);
  }

  async consume(verification: VerificationDocument): Promise<void> {
    await this.transition(verification, UsageReservationStatus.USED);
  }

  async release(verification: VerificationDocument): Promise<void> {
    await this.transition(verification, UsageReservationStatus.RELEASED);
  }

  async releaseSnapshot(reservation: UsageReservationSnapshot): Promise<void> {
    await this.applyTransition(reservation, UsageReservationStatus.RELEASED);
  }

  async status(userId: string): Promise<Record<string, unknown>> {
    const window = await this.windowForUser(userId);
    const entitlement = await this.entitlements.resolve(userId);
    let usage = await this.usages
      .findOne({
        userId: new Types.ObjectId(userId),
        dateKey: window.dateKey,
      })
      .lean()
      .exec();
    if (usage && (await this.refundTerminalUsage(userId, usage))) {
      usage = await this.usages
        .findOne({
          userId: new Types.ObjectId(userId),
          dateKey: window.dateKey,
        })
        .lean()
        .exec();
    }
    const used = usage?.used ?? 0;
    const reserved = usage?.reserved ?? 0;
    const limit = entitlement.policy.dailyInvestigationLimit;
    return {
      dateKey: window.dateKey,
      timezone: window.timezone,
      limit,
      used,
      reserved,
      released: usage?.released ?? 0,
      remaining: Math.max(0, limit - used - reserved),
      resetAt: window.resetAt,
      costs: {
        text: 1,
        link: 1,
        image: 1,
        screenshot: 1,
        audio: 1,
        video: entitlement.policy.videoInvestigationCost,
      },
      paymentsAvailable: false,
      entitlement: {
        plan: entitlement.plan,
        source: entitlement.source,
        expiresAt: entitlement.expiresAt,
      },
    };
  }

  private async transition(
    verification: VerificationDocument,
    target: UsageReservationStatus.USED | UsageReservationStatus.RELEASED,
  ): Promise<void> {
    const stored = verification.usageReservation;
    if (!stored || stored.status === target) return;
    if (
      target === UsageReservationStatus.USED &&
      stored.status !== UsageReservationStatus.RESERVED
    ) {
      return;
    }
    const reservation: UsageReservationSnapshot = {
      usageId: stored.usageId,
      verificationId: verification._id,
      attempt: stored.attempt ?? 0,
      dateKey: stored.dateKey,
      timezone: stored.timezone,
      cost: stored.cost,
      status: stored.status,
      resetAt: stored.resetAt,
      ...(stored.transitionedAt
        ? { transitionedAt: stored.transitionedAt }
        : {}),
    };
    const resolved =
      target === UsageReservationStatus.RELEASED
        ? await this.applyRelease(reservation)
        : await this.applyTransition(reservation, target);
    if (!resolved) return;
    verification.set('usageReservation.status', resolved);
    verification.set('usageReservation.transitionedAt', new Date());
    await verification.save();
  }

  private async applyTransition(
    reservation: UsageReservationSnapshot,
    target: UsageReservationStatus.USED | UsageReservationStatus.RELEASED,
  ): Promise<UsageReservationStatus | null> {
    const transitionedAt = new Date();
    const attemptSelector =
      reservation.attempt === 0 ? { $in: [0, null] } : reservation.attempt;
    const counter =
      target === UsageReservationStatus.USED ? 'used' : 'released';
    const updated = await this.usages
      .findOneAndUpdate(
        {
          _id: reservation.usageId,
          reservations: {
            $elemMatch: {
              verificationId: reservation.verificationId,
              attempt: attemptSelector,
              status: UsageReservationStatus.RESERVED,
            },
          },
        },
        {
          $inc: { reserved: -reservation.cost, [counter]: reservation.cost },
          $set: {
            'reservations.$.status': target,
            'reservations.$.transitionedAt': transitionedAt,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (updated) return target;
    const current = await this.usages
      .findOne({
        _id: reservation.usageId,
        reservations: {
          $elemMatch: {
            verificationId: reservation.verificationId,
            attempt: attemptSelector,
          },
        },
      })
      .lean()
      .exec();
    const existing = current?.reservations.find(
      (item) =>
        item.verificationId.toString() ===
          reservation.verificationId.toString() &&
        (item.attempt ?? 0) === reservation.attempt,
    );
    return existing?.status ?? null;
  }

  private async applyRelease(
    reservation: UsageReservationSnapshot,
  ): Promise<UsageReservationStatus | null> {
    const transitionedAt = new Date();
    const attemptSelector =
      reservation.attempt === 0 ? { $in: [0, null] } : reservation.attempt;
    const selector = (status: UsageReservationStatus) => ({
      _id: reservation.usageId,
      reservations: {
        $elemMatch: {
          verificationId: reservation.verificationId,
          attempt: attemptSelector,
          status,
        },
      },
    });
    const update = (counter: 'reserved' | 'used') => ({
      $inc: { [counter]: -reservation.cost, released: reservation.cost },
      $set: {
        'reservations.$.status': UsageReservationStatus.RELEASED,
        'reservations.$.transitionedAt': transitionedAt,
      },
    });

    const releasedReservation = await this.usages
      .findOneAndUpdate(
        selector(UsageReservationStatus.RESERVED),
        update('reserved'),
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (releasedReservation) return UsageReservationStatus.RELEASED;

    const refundedUsage = await this.usages
      .findOneAndUpdate(selector(UsageReservationStatus.USED), update('used'), {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();
    if (refundedUsage) return UsageReservationStatus.RELEASED;

    const current = await this.usages
      .findOne({
        _id: reservation.usageId,
        reservations: {
          $elemMatch: {
            verificationId: reservation.verificationId,
            attempt: attemptSelector,
          },
        },
      })
      .lean()
      .exec();
    const existing = current?.reservations.find(
      (item) =>
        item.verificationId.toString() ===
          reservation.verificationId.toString() &&
        (item.attempt ?? 0) === reservation.attempt,
    );
    return existing?.status ?? null;
  }

  private async refundTerminalUsage(
    userId: string,
    usage: DailyInvestigationUsage & { _id: Types.ObjectId },
  ): Promise<boolean> {
    const consumed = (usage.reservations ?? []).filter(
      (reservation) => reservation.status === UsageReservationStatus.USED,
    );
    if (!consumed.length) return false;
    const terminal = await this.verifications
      .find({
        _id: { $in: consumed.map((reservation) => reservation.verificationId) },
        userId: new Types.ObjectId(userId),
        status: {
          $in: [
            VerificationStatus.FAILED,
            VerificationStatus.CANCELLED,
            VerificationStatus.DELETED,
          ],
        },
      })
      .select('_id')
      .lean()
      .exec();
    const terminalIds = new Set(
      terminal.map((verification) => verification._id.toString()),
    );
    const refundable = consumed.filter((reservation) =>
      terminalIds.has(reservation.verificationId.toString()),
    );
    let refunded = 0;
    for (const reservation of refundable) {
      const result = await this.applyRelease({
        usageId: usage._id,
        verificationId: reservation.verificationId,
        attempt: reservation.attempt ?? 0,
        dateKey: usage.dateKey,
        timezone: usage.timezone,
        cost: reservation.cost,
        status: reservation.status,
        resetAt: new Date(),
        ...(reservation.transitionedAt
          ? { transitionedAt: reservation.transitionedAt }
          : {}),
      });
      if (result === UsageReservationStatus.RELEASED) refunded += 1;
    }
    if (refunded) {
      this.logger.log({
        event: 'failed_investigation_allowance_reconciled',
        userId,
        dateKey: usage.dateKey,
        refundedReservations: refunded,
      });
    }
    return refunded > 0;
  }

  private costFor(
    sourceType: VerificationSourceType,
    videoCost = this.config.videoCost,
  ): number {
    return sourceType === VerificationSourceType.VIDEO ? videoCost : 1;
  }

  private async windowForUser(userId: string): Promise<{
    dateKey: string;
    timezone: string;
    resetAt: Date;
  }> {
    const user = await this.users
      .findById(userId)
      .select('timezone')
      .lean()
      .exec();
    const timezone = this.validTimezone(user?.timezone) ? user.timezone : 'UTC';
    const now = new Date();
    return {
      dateKey: this.dateKey(now, timezone),
      timezone,
      resetAt: this.nextMidnight(now, timezone),
    };
  }

  private validTimezone(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  private dateKey(value: Date, timezone: string): string {
    const parts = this.parts(value, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
      parts.day,
    ).padStart(2, '0')}`;
  }

  private nextMidnight(value: Date, timezone: string): Date {
    const current = this.parts(value, timezone);
    const target = new Date(
      Date.UTC(current.year, current.month - 1, current.day + 1),
    );
    let guess = target.getTime();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const observed = this.parts(new Date(guess), timezone);
      const observedLocal = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
      guess += target.getTime() - observedLocal;
    }
    return new Date(guess);
  }

  private parts(
    value: Date,
    timezone: string,
  ): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    return values as {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
    };
  }

  private snapshot(
    usage: DailyInvestigationUsageDocument,
    reservation: DailyInvestigationUsageDocument['reservations'][number],
    resetAt: Date,
  ): UsageReservationSnapshot {
    return {
      usageId: usage._id,
      verificationId: reservation.verificationId,
      attempt: reservation.attempt ?? 0,
      dateKey: usage.dateKey,
      timezone: usage.timezone,
      cost: reservation.cost,
      status: reservation.status,
      resetAt,
      ...(reservation.transitionedAt
        ? { transitionedAt: reservation.transitionedAt }
        : {}),
    };
  }

  toStored(
    reservation: UsageReservationSnapshot,
  ): VerificationUsageReservation {
    return {
      usageId: reservation.usageId,
      attempt: reservation.attempt,
      dateKey: reservation.dateKey,
      timezone: reservation.timezone,
      cost: reservation.cost,
      status: reservation.status,
      resetAt: reservation.resetAt,
      ...(reservation.transitionedAt
        ? { transitionedAt: reservation.transitionedAt }
        : {}),
    };
  }
}
