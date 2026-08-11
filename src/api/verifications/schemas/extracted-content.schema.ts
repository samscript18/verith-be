import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';

@Schema({
  timestamps: true,
  collection: 'verification_extracted_contents',
  versionKey: false,
})
export class ExtractedContent {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  verificationId!: Types.ObjectId;

  @Prop({ required: true })
  normalizedText!: string;

  @Prop({ required: true })
  normalizedContentHash!: string;

  @Prop()
  sourceUrl?: string;

  @Prop()
  canonicalUrl?: string;

  @Prop()
  title?: string;

  @Prop()
  publisher?: string;

  @Prop()
  author?: string;

  @Prop()
  publishedAt?: Date;

  @Prop({ enum: UrlExtractionState })
  extractionState?: UrlExtractionState;

  @Prop({ min: 0, max: 1 })
  extractionConfidence?: number;

  @Prop()
  detectedLanguage?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ExtractedContentDocument = HydratedDocument<ExtractedContent>;
export const ExtractedContentSchema =
  SchemaFactory.createForClass(ExtractedContent);
ExtractedContentSchema.index({ normalizedContentHash: 1 });
