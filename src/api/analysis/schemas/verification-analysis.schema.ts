import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  AnalysisSeverity,
  BiasMetricName,
  ManipulationCategory,
  MissingContextType,
  OverallVerdict,
  RiskLevel,
} from '../enums/analysis.enum';

@Schema({ _id: false })
export class ManipulationFinding {
  @Prop({ required: true, enum: ManipulationCategory })
  category!: ManipulationCategory;
  @Prop({ required: true, enum: AnalysisSeverity })
  severity!: AnalysisSeverity;
  @Prop({ required: true })
  phrase!: string;
  @Prop({ required: true, min: 0 })
  startOffset!: number;
  @Prop({ required: true, min: 0 })
  endOffset!: number;
  @Prop({ required: true })
  explanation!: string;
  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;
  @Prop({ type: [String], default: [] })
  limitations!: string[];
}

@Schema({ _id: false })
export class BiasMetric {
  @Prop({ required: true, enum: BiasMetricName })
  metric!: BiasMetricName;
  @Prop({ required: true, min: 0, max: 1 })
  score!: number;
  @Prop({ required: true })
  label!: string;
  @Prop({ required: true })
  explanation!: string;
  @Prop({ type: [String], default: [] })
  textEvidence!: string[];
  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;
  @Prop({ type: [String], default: [] })
  limitations!: string[];
}

@Schema({ _id: false })
export class MissingContextIssue {
  @Prop({ required: true, enum: MissingContextType })
  type!: MissingContextType;
  @Prop({ required: true, enum: AnalysisSeverity })
  severity!: AnalysisSeverity;
  @Prop({ required: true })
  omittedContext!: string;
  @Prop({ required: true })
  whyItMatters!: string;
  @Prop({ required: true })
  correctedContext!: string;
  @Prop({ type: [Types.ObjectId], default: [] })
  evidenceIds!: Types.ObjectId[];
  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;
  @Prop({ type: [String], default: [] })
  limitations!: string[];
}

@Schema({ _id: false })
export class SourceAssessment {
  @Prop({ required: true })
  domain!: string;
  @Prop({ required: true })
  credibilityLevel!: string;
  @Prop({ required: true })
  explanation!: string;
  @Prop({ type: [Types.ObjectId], default: [] })
  evidenceIds!: Types.ObjectId[];
  @Prop({ type: [String], default: [] })
  limitations!: string[];
}

export type VerificationAnalysisDocument =
  HydratedDocument<VerificationAnalysis>;

@Schema({
  timestamps: true,
  collection: 'verification_analyses',
  versionKey: false,
})
export class VerificationAnalysis {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  verificationId!: Types.ObjectId;
  @Prop({ required: true, enum: OverallVerdict })
  overallVerdict!: OverallVerdict;
  @Prop({ required: true, enum: RiskLevel })
  riskLevel!: RiskLevel;
  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;
  @Prop({ type: Object, required: true })
  confidenceFactors!: Record<string, number | boolean>;
  @Prop({
    type: [SchemaFactory.createForClass(ManipulationFinding)],
    default: [],
  })
  manipulationFindings!: ManipulationFinding[];
  @Prop({ type: [SchemaFactory.createForClass(BiasMetric)], default: [] })
  biasMetrics!: BiasMetric[];
  @Prop({
    type: [SchemaFactory.createForClass(MissingContextIssue)],
    default: [],
  })
  missingContextIssues!: MissingContextIssue[];
  @Prop({
    type: [SchemaFactory.createForClass(SourceAssessment)],
    default: [],
  })
  sourceAssessments!: SourceAssessment[];
  @Prop({ type: [String], default: [] })
  limitations!: string[];
  @Prop({ required: true })
  methodVersion!: string;
  @Prop({ required: true })
  promptVersion!: number;
  @Prop({ required: true })
  analyzedAt!: Date;
}

export const VerificationAnalysisSchema =
  SchemaFactory.createForClass(VerificationAnalysis);
