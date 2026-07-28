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

@Module({
  imports: [
    DatabaseModule,
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
  ],
})
export class ApiModule {}
