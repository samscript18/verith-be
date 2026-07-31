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

@Module({
  imports: [
    AdminModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: Challenge.name, schema: ChallengeSchema },
      { name: ChallengeAttempt.name, schema: ChallengeAttemptSchema },
    ]),
  ],
  controllers: [ChallengesController, ChallengesAdminController],
  providers: [ChallengesService],
})
export class ChallengesModule {}
