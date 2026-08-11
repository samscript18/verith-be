import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import { GamificationProfile } from '../../gamification/schemas/gamification-profile.schema';
import { NotificationType } from '../enums/notification.enum';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationScheduleService {
  private readonly logger = new Logger(NotificationScheduleService.name);

  constructor(
    @InjectModel(GamificationProfile.name)
    private readonly profiles: Model<GamificationProfile>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 0 18 * * *', { name: 'daily-streak-reminders', timeZone: 'UTC' })
  async remindExpiringStreaks(now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    )
      .toISOString()
      .slice(0, 10);
    let cursor: Types.ObjectId | undefined;
    let sent = 0;
    do {
      const profiles = await this.profiles
        .find({
          currentStreak: { $gt: 0 },
          lastEligibleActivityDate: yesterday,
          ...(cursor ? { _id: { $gt: cursor } } : {}),
        })
        .select('_id userId currentStreak')
        .sort({ _id: 1 })
        .limit(100)
        .lean()
        .exec();
      if (!profiles.length) break;
      const activeUsers = await this.users
        .find({
          _id: { $in: profiles.map((profile) => profile.userId) },
          status: UserStatus.ACTIVE,
          deletedAt: { $exists: false },
        })
        .select('_id')
        .lean()
        .exec();
      const activeIds = new Set(activeUsers.map((user) => user._id.toString()));
      const results = await Promise.all(
        profiles
          .filter((profile) => activeIds.has(profile.userId.toString()))
          .map((profile) =>
            this.notifications.dispatch({
              userId: profile.userId.toString(),
              type: NotificationType.STREAK_REMINDER,
              title: 'Keep your learning streak active',
              message: `Complete a learning activity or daily challenge today to continue your ${profile.currentStreak}-day streak.`,
              actionUrl: '/app/challenges',
              idempotencyReference: `streak-reminder:${today}:${profile.userId.toString()}`,
              metadata: {
                currentStreak: profile.currentStreak,
                dateKey: today,
              },
            }),
          ),
      );
      sent += results.filter(Boolean).length;
      cursor = profiles.at(-1)?._id;
      if (profiles.length < 100) break;
    } while (cursor);
    this.logger.log({
      event: 'streak_reminders_completed',
      dateKey: today,
      sent,
    });
    return { sent };
  }
}
