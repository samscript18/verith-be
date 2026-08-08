import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import { DAILY_CHALLENGE_QUESTIONS } from '../data/daily-challenge-bank';
import { ChallengeStatus } from '../enums/challenge.enum';
import { Challenge } from '../schemas/challenge.schema';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notification.enum';

@Injectable()
export class DailyChallengeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyChallengeService.name);

  constructor(
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
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
            title: `Daily evidence practice · ${dateKey}`,
            slug,
            scenario:
              'Ten quick decisions about sources, dates, context, uncertainty, and responsible sharing.',
            content:
              'Use the information inside each question. These are original, synthetic media-literacy scenarios and not real investigations.',
            tags: [
              'daily-practice',
              'evidence-evaluation',
              'responsible-sharing',
            ],
            questions: DAILY_CHALLENGE_QUESTIONS.map((question) => ({
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
