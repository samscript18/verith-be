import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { MongooseModule } from '@nestjs/mongoose';
import { GamificationModule } from '../gamification/gamification.module';
import { ChallengesAdminController } from './controllers/challenges-admin.controller';
import { ChallengesController } from './controllers/challenges.controller';
import {
  ChallengeAttempt,
  ChallengeAttemptSchema,
} from './schemas/challenge-attempt.schema';
import { Challenge, ChallengeSchema } from './schemas/challenge.schema';
import { ChallengesService } from './services/challenges.service';
import { DailyChallengeService } from './services/daily-challenge.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { runsScheduler } from '../../shared/utils/process-role';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AdminModule,
    GamificationModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Challenge.name, schema: ChallengeSchema },
      { name: ChallengeAttempt.name, schema: ChallengeAttemptSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ChallengesController, ChallengesAdminController],
  providers: [
    ChallengesService,
    ...(runsScheduler() ? [DailyChallengeService] : []),
  ],
})
export class ChallengesModule {}
