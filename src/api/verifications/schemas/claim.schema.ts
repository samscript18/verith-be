import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ClaimImportance,
  ClaimTimeSensitivity,
  ClaimType,
  ClaimVerifiability,
  SearchQueryCategory,
} from '../enums/claim.enum';

@Schema({ _id: false })
export class ClaimSourceSpan {
  @Prop({ required: true, min: 0 })
  start!: number;

  @Prop({ required: true, min: 0 })
  end!: number;
}

const ClaimSourceSpanSchema = SchemaFactory.createForClass(ClaimSourceSpan);

@Schema({ _id: false })
export class ClaimSearchQuery {
  @Prop({ required: true })
  query!: string;

  @Prop({ enum: SearchQueryCategory, required: true })
  category!: SearchQueryCategory;
}

const ClaimSearchQuerySchema = SchemaFactory.createForClass(ClaimSearchQuery);

@Schema({
  timestamps: true,
  collection: 'verification_claims',
  versionKey: false,
})
export class Claim {
  @Prop({ type: Types.ObjectId, required: true })
  verificationId!: Types.ObjectId;

  @Prop({ required: true })
  sequence!: number;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true })
  normalizedText!: string;

  @Prop({ enum: ClaimType, required: true })
  claimType!: ClaimType;

  @Prop({ enum: ClaimImportance, required: true })
  importance!: ClaimImportance;

  @Prop({ enum: ClaimVerifiability, required: true })
  verifiability!: ClaimVerifiability;

  @Prop({ enum: ClaimTimeSensitivity, required: true })
  timeSensitivity!: ClaimTimeSensitivity;

  @Prop({ type: [String], default: [] })
  entities!: string[];

  @Prop({ type: [String], default: [] })
  dates!: string[];

  @Prop({ type: [String], default: [] })
  locations!: string[];

  @Prop({ type: [String], default: [] })
  quantities!: string[];

  @Prop({ type: ClaimSourceSpanSchema, required: true })
  sourceSpan!: ClaimSourceSpan;

  @Prop({ required: true })
  requiresCurrentInformation!: boolean;

  @Prop({ type: [String], default: [] })
  searchHints!: string[];

  @Prop({ type: [ClaimSearchQuerySchema], default: [] })
  searchQueries!: ClaimSearchQuery[];

  @Prop({ required: true })
  extractionPromptVersion!: number;

  @Prop()
  queryPromptVersion?: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ClaimDocument = HydratedDocument<Claim>;
export const ClaimSchema = SchemaFactory.createForClass(Claim);
ClaimSchema.index({ verificationId: 1, sequence: 1 }, { unique: true });
ClaimSchema.index({ verificationId: 1, verifiability: 1 });
