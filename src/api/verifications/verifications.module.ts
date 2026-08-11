import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsModule } from '../uploads/uploads.module';
import { AiModule } from '../ai/ai.module';
import { VerificationStreamController } from './controllers/verification-stream.controller';
import { VerificationsController } from './controllers/verifications.controller';
import { VerificationRepository } from './repositories/verification.repository';
import {
  IdempotencyRecord,
  IdempotencyRecordSchema,
} from './schemas/idempotency-record.schema';
import {
  VerificationEvent,
  VerificationEventSchema,
} from './schemas/verification-event.schema';
import {
  Verification,
  VerificationSchema,
} from './schemas/verification.schema';
import { VerificationEventService } from './services/verification-event.service';
import { VerificationOrchestratorService } from './services/verification-orchestrator.service';
import { VerificationService } from './services/verification.service';
import { VerificationWorker } from './workers/verification.worker';
import { Claim, ClaimSchema } from './schemas/claim.schema';
import {
  ExtractedContent,
  ExtractedContentSchema,
} from './schemas/extracted-content.schema';
import { ArticleExtractionService } from './services/article-extraction.service';
import { ClaimExtractionService } from './services/claim-extraction.service';
import { ContentProcessingService } from './services/content-processing.service';
import { LanguageDetectionService } from './services/language-detection.service';
import { TextNormalizationService } from './services/text-normalization.service';
import { SearchModule } from '../search/search.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { EvidenceSearchService } from './services/evidence-search.service';
import { AnalysisModule } from '../analysis/analysis.module';
import { MediaModule } from '../media/media.module';
import { ReportsModule } from '../reports/reports.module';
import { runsWorkers } from '../../shared/utils/process-role';
import { UrlClassificationService } from './services/url-classification.service';
import { VerificationQueueModule } from './verification-queue.module';
import {
  DailyInvestigationUsage,
  DailyInvestigationUsageSchema,
} from './schemas/daily-investigation-usage.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { InvestigationUsageService } from './services/investigation-usage.service';
import {
  GuidedInvestigation,
  GuidedInvestigationSchema,
} from './schemas/guided-investigation.schema';
import { GuidedInvestigationService } from './services/guided-investigation.service';
import { MilModule } from '../mil/mil.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  imports: [
    UploadsModule,
    AiModule,
    SearchModule,
    EvidenceModule,
    AnalysisModule,
    MediaModule,
    ReportsModule,
    MilModule,
    EntitlementsModule,
    MongooseModule.forFeature([
      { name: Verification.name, schema: VerificationSchema },
      { name: VerificationEvent.name, schema: VerificationEventSchema },
      { name: IdempotencyRecord.name, schema: IdempotencyRecordSchema },
      { name: Claim.name, schema: ClaimSchema },
      { name: ExtractedContent.name, schema: ExtractedContentSchema },
      {
        name: DailyInvestigationUsage.name,
        schema: DailyInvestigationUsageSchema,
      },
      { name: User.name, schema: UserSchema },
      {
        name: GuidedInvestigation.name,
        schema: GuidedInvestigationSchema,
      },
    ]),
    VerificationQueueModule,
  ],
  controllers: [VerificationsController, VerificationStreamController],
  providers: [
    VerificationRepository,
    VerificationEventService,
    VerificationOrchestratorService,
    VerificationService,
    ...(runsWorkers() ? [VerificationWorker] : []),
    TextNormalizationService,
    UrlClassificationService,
    LanguageDetectionService,
    ArticleExtractionService,
    ClaimExtractionService,
    ContentProcessingService,
    EvidenceSearchService,
    InvestigationUsageService,
    GuidedInvestigationService,
  ],
  exports: [
    VerificationService,
    VerificationEventService,
    InvestigationUsageService,
    GuidedInvestigationService,
    MongooseModule,
  ],
})
export class VerificationsModule {}
