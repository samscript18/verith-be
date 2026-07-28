import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import { VerificationStage } from '../enums/verification-stage.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import { VerificationVisibility } from '../enums/verification-visibility.enum';

@Schema({
  timestamps: true,
  collection: 'verifications',
  versionKey: 'version',
})
export class Verification {
  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ enum: VerificationSourceType, required: true })
  sourceType!: VerificationSourceType;

  @Prop({ enum: VerificationStatus, default: VerificationStatus.QUEUED })
  status!: VerificationStatus;

  @Prop({ enum: VerificationStage, default: VerificationStage.RECEIVED })
  currentStage!: VerificationStage;

  @Prop({ min: 0, max: 100, default: 0 })
  progress!: number;

  @Prop({
    enum: VerificationVisibility,
    default: VerificationVisibility.PRIVATE,
  })
  visibility!: VerificationVisibility;

  @Prop({ maxlength: 200 })
  title?: string;

  @Prop({ type: Object, required: true })
  input!: Record<string, unknown>;

  @Prop({ maxlength: 1000 })
  question?: string;

  @Prop({ maxlength: 20 })
  requestedLanguage?: string;

  @Prop({ maxlength: 50 })
  detectedLanguage?: string;

  @Prop({ type: Object })
  urlMetadata?: Record<string, unknown>;

  @Prop({ type: [Types.ObjectId], default: [] })
  mediaAssetIds!: Types.ObjectId[];

  @Prop()
  processingStartedAt?: Date;

  @Prop()
  processingCompletedAt?: Date;

  @Prop()
  cancelRequestedAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  failureCode?: string;

  @Prop()
  failureSummary?: string;

  @Prop({ default: 0 })
  claimsCount!: number;

  @Prop({ default: 0 })
  evidenceCount!: number;

  @Prop({ default: 'WEB' })
  origin!: string;

  @Prop({ required: true })
  idempotencyKey!: string;

  @Prop({ default: 'ACCOUNT_LIFETIME' })
  retentionPolicy!: string;

  @Prop()
  deletedAt?: Date;

  @Prop({ default: 0 })
  retryCount!: number;

  @Prop({ default: 0, select: false })
  eventSequence!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type VerificationDocument = HydratedDocument<Verification>;
export const VerificationSchema = SchemaFactory.createForClass(Verification);
VerificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
VerificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
VerificationSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
