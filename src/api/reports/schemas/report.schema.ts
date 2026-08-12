import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OverallVerdict, RiskLevel } from '../../analysis/enums/analysis.enum';
import { ReportStatus, ReportVisibility } from '../enums/report.enum';
import { SupportedLanguage } from '../../../shared/language/supported-language';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true, collection: 'reports', versionKey: false })
export class Report {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  verificationId!: Types.ObjectId;
  @Prop({ required: true })
  version!: number;
  @Prop({ required: true, enum: ReportStatus })
  status!: ReportStatus;
  @Prop({ required: true, enum: OverallVerdict })
  overallVerdict!: OverallVerdict;
  @Prop({ required: true, enum: RiskLevel })
  riskLevel!: RiskLevel;
  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;
  @Prop({ required: true, default: SupportedLanguage.ENGLISH, maxlength: 20 })
  sourceLanguage!: string;
  @Prop({
    required: true,
    enum: SupportedLanguage,
    default: SupportedLanguage.ENGLISH,
  })
  requestedLanguage!: SupportedLanguage;
  @Prop({ type: Object, required: true })
  confidenceFactors!: Record<string, number | boolean>;
  @Prop({ required: true })
  summary!: string;
  @Prop({ type: [Object], default: [] })
  claims!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] })
  evidence!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] })
  manipulationAnalysis!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] })
  biasAnalysis!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] })
  missingContext!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] })
  sourceCredibility!: Record<string, unknown>[];
  @Prop({ type: Object })
  mediaAnalysis?: Record<string, unknown>;
  @Prop({ type: Object })
  audioAnalysis?: Record<string, unknown>;
  @Prop({ type: Object })
  aiIndicators?: Record<string, unknown>;
  @Prop({ type: [String], default: [] })
  recommendedActions!: string[];
  @Prop({ type: [Object], default: [] })
  learningRecommendations!: Record<string, unknown>[];
  @Prop({ type: [String], default: [] })
  limitations!: string[];
  @Prop({ type: Object, required: true })
  methodologyVersions!: Record<string, string>;
  @Prop({ type: Object, required: true })
  providerSummary!: Record<string, unknown>;
  @Prop({ required: true })
  schemaVersion!: string;
  @Prop({ required: true })
  generatedAt!: Date;
  @Prop()
  publishedAt?: Date;
  @Prop({ required: true, enum: ReportVisibility })
  visibility!: ReportVisibility;
  @Prop({ unique: true, sparse: true })
  publicSlug?: string;
  @Prop()
  publicAccessRevokedAt?: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ verificationId: 1, version: 1 }, { unique: true });
ReportSchema.index({ verificationId: 1, status: 1 });
