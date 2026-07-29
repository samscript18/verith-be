import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { VerificationsModule } from './verifications/verifications.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { EvidenceModule } from './evidence/evidence.module';
import { AnalysisModule } from './analysis/analysis.module';
import { PublishersModule } from './publishers/publishers.module';
import { MediaModule } from './media/media.module';
import { ReportsModule } from './reports/reports.module';
import { LearningModule } from './learning/learning.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { GamificationModule } from './gamification/gamification.module';
import { ChallengesModule } from './challenges/challenges.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PrivacyModule } from './privacy/privacy.module';
import { DomainEventsModule } from '../core/events/domain-events.module';

@Module({
  imports: [
    DatabaseModule,
    DomainEventsModule,
    IntegrationsModule,
    HealthModule,
    UsersModule,
    AuthModule,
    UploadsModule,
    VerificationsModule,
    AiModule,
    SearchModule,
    EvidenceModule,
    AnalysisModule,
    PublishersModule,
    MediaModule,
    ReportsModule,
    LearningModule,
    QuizzesModule,
    GamificationModule,
    ChallengesModule,
    NotificationsModule,
    WhatsAppModule,
    AdminModule,
    AnalyticsModule,
    PrivacyModule,
  ],
})
export class ApiModule {}
