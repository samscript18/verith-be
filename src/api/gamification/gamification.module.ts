import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { GamificationAdminController } from './controllers/gamification-admin.controller';
import { GamificationController } from './controllers/gamification.controller';
import { Badge, BadgeSchema } from './schemas/badge.schema';
import {
  GamificationProfile,
  GamificationProfileSchema,
} from './schemas/gamification-profile.schema';
import {
  RewardTransaction,
  RewardTransactionSchema,
} from './schemas/reward-transaction.schema';
import { UserBadge, UserBadgeSchema } from './schemas/user-badge.schema';
import { GamificationService } from './services/gamification.service';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AchievementEvent,
  AchievementEventSchema,
} from './schemas/achievement-event.schema';
import { GamificationCatalogService } from './services/gamification-catalog.service';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { GamificationDomainHandler } from './handlers/gamification-domain.handler';
import {
  LessonProgress,
  LessonProgressSchema,
} from '../learning/schemas/lesson-progress.schema';
import { Lesson, LessonSchema } from '../learning/schemas/lesson.schema';
import {
  QuizAttempt,
  QuizAttemptSchema,
} from '../quizzes/schemas/quiz-attempt.schema';
import { Quiz, QuizSchema } from '../quizzes/schemas/quiz.schema';
import {
  ChallengeAttempt,
  ChallengeAttemptSchema,
} from '../challenges/schemas/challenge-attempt.schema';
import {
  Challenge,
  ChallengeSchema,
} from '../challenges/schemas/challenge.schema';
import {
  MissionParticipant,
  MissionParticipantSchema,
} from '../missions/schemas/mission-participant.schema';
import { Mission, MissionSchema } from '../missions/schemas/mission.schema';
import { GamificationReconciliationService } from './services/gamification-reconciliation.service';

@Module({
  imports: [
    AdminModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: RewardTransaction.name, schema: RewardTransactionSchema },
      { name: GamificationProfile.name, schema: GamificationProfileSchema },
      { name: Badge.name, schema: BadgeSchema },
      { name: UserBadge.name, schema: UserBadgeSchema },
      { name: User.name, schema: UserSchema },
      { name: AchievementEvent.name, schema: AchievementEventSchema },
      { name: Verification.name, schema: VerificationSchema },
      { name: LessonProgress.name, schema: LessonProgressSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Quiz.name, schema: QuizSchema },
      { name: ChallengeAttempt.name, schema: ChallengeAttemptSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: MissionParticipant.name, schema: MissionParticipantSchema },
      { name: Mission.name, schema: MissionSchema },
    ]),
  ],
  controllers: [GamificationController, GamificationAdminController],
  providers: [
    GamificationService,
    GamificationCatalogService,
    GamificationDomainHandler,
    GamificationReconciliationService,
  ],
  exports: [GamificationService, MongooseModule],
})
export class GamificationModule {}
