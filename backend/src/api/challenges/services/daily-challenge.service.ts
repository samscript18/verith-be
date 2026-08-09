import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import { dailyChallengeContent } from '../data/daily-challenge-bank';
import { ChallengeStatus } from '../enums/challenge.enum';
import { Challenge } from '../schemas/challenge.schema';
import { ChallengeAttempt } from '../schemas/challenge-attempt.schema';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notification.enum';

@Injectable()
export class DailyChallengeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyChallengeService.name);

  constructor(
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
    @InjectModel(ChallengeAttempt.name)
    private readonly attempts: Model<ChallengeAttempt>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureToday();
  }

  @Cron('0 15 * * * *', { name: 'daily-challenge-publication' })
  async ensureToday(now = new Date()): Promise<void> {
    const dateKey = now.toISOString().slice(0, 10);
    const slug = `daily-media-literacy-${dateKey}`;
    const content = dailyChallengeContent(dateKey);
    const obsolete = await this.challenges
      .find({
        slug: /^daily-media-literacy-/,
        $or: [
          { dailyDateKey: { $ne: dateKey } },
          { dailyContentVersion: { $ne: 2 } },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    if (obsolete.length) {
      const ids = obsolete.map((item) => item._id);
      await this.attempts.deleteMany({ challengeId: { $in: ids } }).exec();
      await this.challenges.deleteMany({ _id: { $in: ids } }).exec();
    }
    const existing = await this.challenges
      .findOne({ slug })
      .select('_id notificationBroadcastAt')
      .lean()
      .exec();
    if (existing?.notificationBroadcastAt) return;
    let challengeId = existing?._id;
    if (!existing) {
      const owner = await this.users
        .findOne({ role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE })
        .select('_id')
        .lean()
        .exec();
      if (!owner) {
        this.logger.warn({
          event: 'daily_challenge_skipped',
          safeCode: 'ACTIVE_SUPER_ADMIN_REQUIRED',
          dateKey,
        });
        return;
      }
      const publishAt = new Date(`${dateKey}T00:00:00.000Z`);
      const expiresAt = new Date(publishAt.getTime() + 24 * 60 * 60 * 1000);
      const result = await this.challenges.updateOne(
        { slug },
        {
          $setOnInsert: {
            dailyDateKey: dateKey,
            dailyContentVersion: 2,
            title: content.title,
            slug,
            scenario: content.scenario,
            content: content.content,
            tags: ['daily-practice', ...content.topic.tags],
            questions: content.questions.map((question) => ({
              ...question,
              options: question.options.map((option) => ({ ...option })),
              correctOptionIds: [...question.correctOptionIds],
            })),
            difficulty: 'BEGINNER',
            rewardPolicy: { xp: 30, truthPoints: 12 },
            maxAttempts: 2,
            passingScore: 70,
            publishAt,
            expiresAt,
            status: ChallengeStatus.PUBLISHED,
            createdBy: new Types.ObjectId(owner._id),
          },
        },
        { upsert: true },
      );
      challengeId = result.upsertedId ?? challengeId;
    }
    if (!challengeId) return;
    const delivery = await this.notifications.broadcast({
      type: NotificationType.DAILY_CHALLENGE,
      title: 'Today’s evidence practice is ready',
      message:
        'Take a few minutes to practise checking sources, context, and responsible sharing.',
      actionUrl: '/app/challenges',
      idempotencyReference: `daily-challenge:${dateKey}`,
      metadata: { challengeId: challengeId.toString(), dateKey, slug },
    });
    await this.challenges.updateOne(
      { _id: challengeId },
      { $set: { notificationBroadcastAt: now } },
    );
    this.logger.log({
      event: 'daily_challenge_notifications_completed',
      dateKey,
      ...delivery,
    });
  }
}
