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
    ]),
  ],
  controllers: [GamificationController, GamificationAdminController],
  providers: [
    GamificationService,
    GamificationCatalogService,
    GamificationDomainHandler,
  ],
  exports: [GamificationService, MongooseModule],
})
export class GamificationModule {}
