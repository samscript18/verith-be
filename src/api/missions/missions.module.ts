import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MilModule } from '../mil/mil.module';
import { GamificationModule } from '../gamification/gamification.module';
import { MissionsController } from './controllers/missions.controller';
import {
  MissionAssessmentAttempt,
  MissionAssessmentAttemptSchema,
} from './schemas/mission-assessment-attempt.schema';
import {
  MissionAssessment,
  MissionAssessmentSchema,
} from './schemas/mission-assessment.schema';
import {
  MissionParticipant,
  MissionParticipantSchema,
} from './schemas/mission-participant.schema';
import { Mission, MissionSchema } from './schemas/mission.schema';
import { MissionsService } from './services/missions.service';
import { Lesson, LessonSchema } from '../learning/schemas/lesson.schema';
import {
  LessonProgress,
  LessonProgressSchema,
} from '../learning/schemas/lesson-progress.schema';
import {
  Challenge,
  ChallengeSchema,
} from '../challenges/schemas/challenge.schema';
import {
  ChallengeAttempt,
  ChallengeAttemptSchema,
} from '../challenges/schemas/challenge-attempt.schema';

@Module({
  imports: [
    MilModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: Mission.name, schema: MissionSchema },
      { name: MissionAssessment.name, schema: MissionAssessmentSchema },
      { name: MissionParticipant.name, schema: MissionParticipantSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: LessonProgress.name, schema: LessonProgressSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: ChallengeAttempt.name, schema: ChallengeAttemptSchema },
      {
        name: MissionAssessmentAttempt.name,
        schema: MissionAssessmentAttemptSchema,
      },
    ]),
  ],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
