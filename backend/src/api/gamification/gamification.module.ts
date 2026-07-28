import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RewardTransaction.name, schema: RewardTransactionSchema },
      { name: GamificationProfile.name, schema: GamificationProfileSchema },
      { name: Badge.name, schema: BadgeSchema },
      { name: UserBadge.name, schema: UserBadgeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [GamificationController, GamificationAdminController],
  providers: [GamificationService],
  exports: [GamificationService, MongooseModule],
})
export class GamificationModule {}
