import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SearchProviderName } from '../../search/enums/search-provider-name.enum';
import { SearchQueryCategory } from '../../verifications/enums/claim.enum';
import {
  EvidenceAccessStatus,
  EvidenceAuthority,
  EvidenceLineageType,
  EvidenceRelationship,
} from '../enums/evidence.enum';

export type EvidenceDocument = HydratedDocument<Evidence>;

@Schema({ timestamps: true, collection: 'evidence', versionKey: false })
export class Evidence {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  verificationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  claimId!: Types.ObjectId;

  @Prop({ required: true, enum: SearchProviderName })
  provider!: SearchProviderName;

  @Prop({ required: true })
  searchQuery!: string;

  @Prop({ required: true, enum: SearchQueryCategory })
  queryCategory!: SearchQueryCategory;

  @Prop()
  searchQueryLanguage?: string;

  @Prop()
  searchQuerySource?: string;

  @Prop({ required: true })
  sourceUrl!: string;

  @Prop({ required: true })
  canonicalUrl!: string;

  @Prop({ required: true, index: true })
  domain!: string;

  @Prop()
  publisher?: string;

  @Prop({ required: true })
  title!: string;

  @Prop()
  author?: string;

  @Prop()
  publishedAt?: Date;

  @Prop({ required: true })
  retrievedAt!: Date;

  @Prop({ default: 'text/html' })
  contentType!: string;

  @Prop()
  language?: string;

  @Prop()
  relevantExcerpt?: string;

  @Prop()
  originalExcerpt?: string;

  @Prop()
  contentHash?: string;

  @Prop({ required: true, enum: EvidenceRelationship })
  relationship!: EvidenceRelationship;

  @Prop({ required: true, min: 0, max: 1 })
  relevanceScore!: number;

  @Prop({ required: true, enum: EvidenceAuthority })
  authority!: EvidenceAuthority;

  @Prop({ required: true, min: 0, max: 1 })
  recencyScore!: number;

  @Prop({ required: true, min: 0, max: 1 })
  directnessScore!: number;

  @Prop({ required: true, min: 0, max: 1 })
  credibilityScore!: number;

  @Prop({ required: true, enum: EvidenceAccessStatus })
  accessStatus!: EvidenceAccessStatus;

  @Prop({ required: true, enum: EvidenceLineageType })
  lineageType!: EvidenceLineageType;

  @Prop({ type: Types.ObjectId })
  duplicateOfEvidenceId?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const EvidenceSchema = SchemaFactory.createForClass(Evidence);
EvidenceSchema.index({ verificationId: 1, claimId: 1, canonicalUrl: 1 });
EvidenceSchema.index({ verificationId: 1, claimId: 1, contentHash: 1 });
EvidenceSchema.index({ verificationId: 1, relevanceScore: -1 });
