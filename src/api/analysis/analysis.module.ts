import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { Evidence, EvidenceSchema } from '../evidence/schemas/evidence.schema';
import { Claim, ClaimSchema } from '../verifications/schemas/claim.schema';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import {
  ExtractedContent,
  ExtractedContentSchema,
} from '../verifications/schemas/extracted-content.schema';
import {
  ClaimEvaluation,
  ClaimEvaluationSchema,
} from './schemas/claim-evaluation.schema';
import {
  VerificationAnalysis,
  VerificationAnalysisSchema,
} from './schemas/verification-analysis.schema';
import { VerificationAnalysisService } from './services/verification-analysis.service';
import { PublishersModule } from '../publishers/publishers.module';

@Module({
  imports: [
    AiModule,
    PublishersModule,
    MongooseModule.forFeature([
      { name: Claim.name, schema: ClaimSchema },
      { name: Verification.name, schema: VerificationSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: ExtractedContent.name, schema: ExtractedContentSchema },
      { name: ClaimEvaluation.name, schema: ClaimEvaluationSchema },
      { name: VerificationAnalysis.name, schema: VerificationAnalysisSchema },
    ]),
  ],
  providers: [VerificationAnalysisService],
  exports: [VerificationAnalysisService, MongooseModule],
})
export class AnalysisModule {}
