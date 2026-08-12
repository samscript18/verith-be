import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProviderExecution,
  ProviderExecutionSchema,
} from '../ai/schemas/provider-execution.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { AnalyticsController } from './controllers/analytics.controller';
import { ProductAnalyticsController } from './controllers/product-analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import {
  AnalyticsEvent,
  AnalyticsEventSchema,
} from './schemas/analytics-event.schema';
import {
  MissionParticipant,
  MissionParticipantSchema,
} from '../missions/schemas/mission-participant.schema';
import { Mission, MissionSchema } from '../missions/schemas/mission.schema';
import {
  MissionAssessmentAttempt,
  MissionAssessmentAttemptSchema,
} from '../missions/schemas/mission-assessment-attempt.schema';
import {
  ReportFeedback,
  ReportFeedbackSchema,
} from '../reports/schemas/report-feedback.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Verification.name, schema: VerificationSchema },
      { name: ProviderExecution.name, schema: ProviderExecutionSchema },
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: Mission.name, schema: MissionSchema },
      { name: MissionParticipant.name, schema: MissionParticipantSchema },
      {
        name: MissionAssessmentAttempt.name,
        schema: MissionAssessmentAttemptSchema,
      },
      { name: ReportFeedback.name, schema: ReportFeedbackSchema },
    ]),
  ],
  controllers: [AnalyticsController, ProductAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
