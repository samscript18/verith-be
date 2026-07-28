import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { RedisOptions } from 'ioredis';
import type { RedisConfig } from '../../shared/config';
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
import { VERIFICATION_QUEUE } from './verification.constants';
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

const redisOptions = (value: string): RedisOptions => {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    ...(url.protocol === 'rediss:'
      ? { tls: { servername: url.hostname } }
      : {}),
    maxRetriesPerRequest: null,
  };
};

@Module({
  imports: [
    UploadsModule,
    AiModule,
    SearchModule,
    EvidenceModule,
    AnalysisModule,
    MediaModule,
    MongooseModule.forFeature([
      { name: Verification.name, schema: VerificationSchema },
      { name: VerificationEvent.name, schema: VerificationEventSchema },
      { name: IdempotencyRecord.name, schema: IdempotencyRecordSchema },
      { name: Claim.name, schema: ClaimSchema },
      { name: ExtractedContent.name, schema: ExtractedContentSchema },
    ]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: redisOptions(
          configService.getOrThrow<RedisConfig>('redis').url,
        ),
        prefix: 'verith:bull',
      }),
    }),
    BullModule.registerQueue({ name: VERIFICATION_QUEUE }),
  ],
  controllers: [VerificationsController, VerificationStreamController],
  providers: [
    VerificationRepository,
    VerificationEventService,
    VerificationOrchestratorService,
    VerificationService,
    VerificationWorker,
    TextNormalizationService,
    LanguageDetectionService,
    ArticleExtractionService,
    ClaimExtractionService,
    ContentProcessingService,
    EvidenceSearchService,
  ],
  exports: [VerificationService, VerificationEventService, MongooseModule],
})
export class VerificationsModule {}
