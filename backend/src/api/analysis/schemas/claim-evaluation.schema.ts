import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ClaimVerdict } from '../enums/analysis.enum';

export type ClaimEvaluationDocument = HydratedDocument<ClaimEvaluation>;

@Schema({
  timestamps: true,
  collection: 'claim_evaluations',
  versionKey: false,
})
export class ClaimEvaluation {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  verificationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  claimId!: Types.ObjectId;

  @Prop({ required: true, enum: ClaimVerdict })
  verdict!: ClaimVerdict;

  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;

  @Prop({ required: true })
  explanation!: string;

  @Prop({ type: [Types.ObjectId], default: [] })
  supportingEvidenceIds!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], default: [] })
  contradictingEvidenceIds!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], default: [] })
  contextEvidenceIds!: Types.ObjectId[];

  @Prop({ required: true })
  evidenceSummary!: string;

  @Prop({ type: [String], default: [] })
  uncertainties!: string[];

  @Prop({ type: [String], default: [] })
  limitations!: string[];

  @Prop({ type: Object, required: true })
  confidenceFactors!: Record<string, number | boolean>;

  @Prop({ required: true })
  evaluatedAt!: Date;

  @Prop({ required: true })
  methodVersion!: string;

  @Prop({ required: true })
  promptVersion!: number;
}

export const ClaimEvaluationSchema =
  SchemaFactory.createForClass(ClaimEvaluation);
ClaimEvaluationSchema.index(
  { verificationId: 1, claimId: 1 },
  { unique: true },
);
