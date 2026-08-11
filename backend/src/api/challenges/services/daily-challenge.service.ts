import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/schemas/user.schema';
import type { DailyChallengeConfig } from '../../../shared/config';
import { buildDailyChallengeBlueprint } from '../data/daily-challenge-blueprint';
import { ChallengeStatus } from '../enums/challenge.enum';
import { Challenge } from '../schemas/challenge.schema';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { AiDailyChallengeGenerator } from './ai-daily-challenge.generator';
import { DailyChallengeDuplicateService } from './daily-challenge-duplicate.service';
import {
  DailyChallengeContentError,
  DailyChallengeValidator,
} from './daily-challenge-validator.service';
import { TemplateDailyChallengeGenerator } from './template-daily-challenge.generator';
import { ChallengeGenerationMode } from '../enums/daily-challenge.enum';

@Injectable()
export class DailyChallengeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyChallengeService.name);
  private readonly config: DailyChallengeConfig;

  constructor(
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly notifications: NotificationsService,
    private readonly aiGenerator: AiDailyChallengeGenerator,
    private readonly templateGenerator: TemplateDailyChallengeGenerator,
    private readonly validator: DailyChallengeValidator,
    private readonly duplicates: DailyChallengeDuplicateService,
    configService: ConfigService,
  ) {
    this.config =
      configService.getOrThrow<DailyChallengeConfig>('dailyChallenge');
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureToday();
  }

  @Cron('0 15 * * * *', { name: 'daily-challenge-publication' })
  async ensureToday(now = new Date()): Promise<void> {
    const startedAt = Date.now();
    const dateKey = now.toISOString().slice(0, 10);
    const slug = `daily-media-literacy-${dateKey}`;
    const existing = await this.challenges
      .findOne({ slug })
      .select('_id status notificationBroadcastAt')
      .lean()
      .exec();
    if (
      existing?.notificationBroadcastAt ||
      (existing && existing.status !== ChallengeStatus.PUBLISHED)
    )
      return;
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
      const blueprint = buildDailyChallengeBlueprint(dateKey);
      let generated;
      let fallbackReason: string | undefined;
      if (this.config.aiEnabled) {
        try {
          generated = await this.aiGenerator.generate(blueprint);
          generated.challenge = this.validator.validate(
            generated.challenge,
            blueprint,
          );
          await this.duplicates.assertFresh(generated.challenge, now);
        } catch (error) {
          fallbackReason = this.safeFailureCode(error);
          this.logger.warn({
            event: 'daily_challenge_ai_fallback',
            dateKey,
            slug,
            fallbackReason,
            durationMs: Date.now() - startedAt,
          });
        }
      } else {
        fallbackReason = 'AI_GENERATION_DISABLED';
      }
      if (!generated) {
        generated = await this.templateGenerator.generate(
          blueprint,
          fallbackReason,
        );
        generated.challenge = this.validator.validate(
          generated.challenge,
          blueprint,
        );
      }
      const publishAt = new Date(`${dateKey}T00:00:00.000Z`);
      const expiresAt = new Date(publishAt.getTime() + 24 * 60 * 60 * 1000);
      const status = this.config.autoPublish
        ? ChallengeStatus.PUBLISHED
        : ChallengeStatus.DRAFT;
      const result = await this.challenges.updateOne(
        { slug },
        {
          $setOnInsert: {
            dailyDateKey: dateKey,
            dailyContentVersion: 3,
            title: generated.challenge.title,
            slug,
            scenario: generated.challenge.scenario,
            content: generated.challenge.description,
            tags: [
              'daily-practice',
              ...blueprint.topicFocus.map((topic) =>
                topic.toLowerCase().replaceAll('_', '-'),
              ),
            ],
            questions: generated.challenge.questions.map((question) =>
              this.validator.toStoredQuestion(question),
            ),
            difficulty: 'BEGINNER',
            rewardPolicy: { xp: 30, truthPoints: 12 },
            maxAttempts: 2,
            passingScore: 70,
            publishAt,
            expiresAt,
            status,
            createdBy: new Types.ObjectId(owner._id),
            language: blueprint.language,
            generation: generated.generation,
          },
        },
        { upsert: true },
      );
      challengeId = result.upsertedId ?? challengeId;
      if (!challengeId) {
        challengeId = (
          await this.challenges.findOne({ slug }).select('_id').lean().exec()
        )?._id;
      }
      this.logger.log({
        event: 'daily_challenge_published',
        dateKey,
        slug,
        generationMode: generated.generation.mode,
        provider: generated.generation.provider,
        model: generated.generation.model,
        validationResult: generated.generation.validationStatus,
        fallbackUsed:
          generated.generation.mode === ChallengeGenerationMode.TEMPLATE,
        durationMs: Date.now() - startedAt,
      });
      if (status !== ChallengeStatus.PUBLISHED) return;
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

  private safeFailureCode(error: unknown): string {
    if (error instanceof DailyChallengeContentError) return error.safeCode;
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    )
      return error.code;
    return 'AI_GENERATION_UNAVAILABLE';
  }
}
