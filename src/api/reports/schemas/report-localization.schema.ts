import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SupportedLanguage } from '../../../shared/language/supported-language';

export enum ReportLocalizationStatus {
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
  FALLBACK = 'FALLBACK',
}

export type ReportLocalizationDocument = HydratedDocument<ReportLocalization>;

@Schema({
  timestamps: true,
  collection: 'report_localizations',
  versionKey: false,
})
export class ReportLocalization {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  reportId!: Types.ObjectId;

  @Prop({ required: true, enum: SupportedLanguage })
  language!: SupportedLanguage;

  @Prop({ required: true })
  localizationVersion!: string;

  @Prop({ required: true, enum: ReportLocalizationStatus })
  status!: ReportLocalizationStatus;

  @Prop({ type: Object, required: true })
  content!: Record<string, unknown>;

  @Prop()
  provider?: string;

  @Prop()
  model?: string;

  @Prop({ type: [String], default: [] })
  limitations!: string[];

  @Prop({ required: true })
  generatedAt!: Date;

  @Prop()
  retryAfter?: Date;

  @Prop()
  failureCode?: string;

  @Prop({ default: false })
  retryable!: boolean;

  @Prop()
  leaseToken?: string;

  @Prop()
  leaseExpiresAt?: Date;

  @Prop()
  lastAttemptAt?: Date;
}

export const ReportLocalizationSchema =
  SchemaFactory.createForClass(ReportLocalization);
ReportLocalizationSchema.index(
  { reportId: 1, language: 1, localizationVersion: 1 },
  { unique: true },
);
