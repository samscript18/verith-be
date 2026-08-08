import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import { CompetencyLevel } from '../enums/competency-level.enum';

@Schema({ _id: false })
export class CompetencyProfileEntry {
  @Prop({ enum: MediaLiteracyCompetency, required: true })
  competency!: MediaLiteracyCompetency;
  @Prop({ enum: CompetencyLevel, required: true }) level!: CompetencyLevel;
  @Prop({ required: true, min: 0 }) evidenceCount!: number;
  @Prop({ required: true, min: 0 }) scoredEvidenceCount!: number;
  @Prop({ min: 0, max: 1 }) averageScore?: number;
  @Prop({ required: true }) notEnoughEvidence!: boolean;
  @Prop({ required: true }) lastEvaluatedAt!: Date;
  @Prop({ type: [Object], default: [] }) scoreHistory!: Array<{
    score: number;
    sourceType: string;
    sourceActivityId: string;
    occurredAt: Date;
  }>;
}

const CompetencyProfileEntrySchema = SchemaFactory.createForClass(
  CompetencyProfileEntry,
);

@Schema({
  timestamps: true,
  collection: 'mil_growth_profiles',
  versionKey: 'version',
})
export class MilGrowthProfile {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  userId!: Types.ObjectId;
  @Prop({ required: true }) scoringRuleVersion!: string;
  @Prop({ type: [CompetencyProfileEntrySchema], default: [] })
  competencies!: CompetencyProfileEntry[];
  @Prop() lastEvaluatedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export type MilGrowthProfileDocument = HydratedDocument<MilGrowthProfile>;
export const MilGrowthProfileSchema =
  SchemaFactory.createForClass(MilGrowthProfile);
