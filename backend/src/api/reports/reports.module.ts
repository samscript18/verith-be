import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ClaimEvaluation,
  ClaimEvaluationSchema,
} from '../analysis/schemas/claim-evaluation.schema';
import {
  VerificationAnalysis,
  VerificationAnalysisSchema,
} from '../analysis/schemas/verification-analysis.schema';
import { Evidence, EvidenceSchema } from '../evidence/schemas/evidence.schema';
import {
  MediaAnalysis,
  MediaAnalysisSchema,
} from '../media/schemas/media-analysis.schema';
import {
  Transcript,
  TranscriptSchema,
} from '../media/schemas/transcript.schema';
import { Claim, ClaimSchema } from '../verifications/schemas/claim.schema';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { PublicReportsController } from './controllers/public-reports.controller';
import { ReportsController } from './controllers/reports.controller';
import {
  ReportExport,
  ReportExportSchema,
} from './schemas/report-export.schema';
import {
  ReportFeedback,
  ReportFeedbackSchema,
} from './schemas/report-feedback.schema';
import { Report, ReportSchema } from './schemas/report.schema';
import { ReportService } from './services/report.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: ReportFeedback.name, schema: ReportFeedbackSchema },
      { name: ReportExport.name, schema: ReportExportSchema },
      { name: Verification.name, schema: VerificationSchema },
      { name: Claim.name, schema: ClaimSchema },
      { name: ClaimEvaluation.name, schema: ClaimEvaluationSchema },
      { name: VerificationAnalysis.name, schema: VerificationAnalysisSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: MediaAnalysis.name, schema: MediaAnalysisSchema },
      { name: Transcript.name, schema: TranscriptSchema },
    ]),
  ],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportService],
  exports: [ReportService, MongooseModule],
})
export class ReportsModule {}
