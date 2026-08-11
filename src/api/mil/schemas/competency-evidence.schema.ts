import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import { CompetencyEvidenceSource } from '../enums/competency-level.enum';

@Schema({
  timestamps: true,
  collection: 'mil_competency_evidence',
  versionKey: false,
})
export class CompetencyEvidence {
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ enum: MediaLiteracyCompetency, required: true })
  competency!: MediaLiteracyCompetency;
  @Prop({ enum: CompetencyEvidenceSource, required: true })
  sourceType!: CompetencyEvidenceSource;
  @Prop({ required: true }) sourceActivityId!: string;
  @Prop({ min: 0, max: 1 }) score?: number;
  @Prop({ required: true }) scoringRuleVersion!: string;
  @Prop({ type: Object, default: {} }) metadata!: Record<string, unknown>;
  @Prop({ required: true }) occurredAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export type CompetencyEvidenceDocument = HydratedDocument<CompetencyEvidence>;
export const CompetencyEvidenceSchema =
  SchemaFactory.createForClass(CompetencyEvidence);
CompetencyEvidenceSchema.index(
  { userId: 1, competency: 1, sourceType: 1, sourceActivityId: 1 },
  { unique: true },
);
CompetencyEvidenceSchema.index({ userId: 1, occurredAt: -1 });
