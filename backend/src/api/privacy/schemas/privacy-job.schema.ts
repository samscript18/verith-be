import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PrivacyJobStatus, PrivacyJobType } from '../enums/privacy-job.enum';

@Schema({ timestamps: true, collection: 'privacy_jobs', versionKey: false })
export class PrivacyJob {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: PrivacyJobType, index: true })
  type!: PrivacyJobType;

  @Prop({ required: true, enum: PrivacyJobStatus, index: true })
  status!: PrivacyJobStatus;

  @Prop({ select: false })
  downloadTokenHash?: string;

  @Prop({ select: false })
  encryptedPayload?: string;

  @Prop()
  contentHash?: string;

  @Prop()
  bytes?: number;

  @Prop()
  expiresAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  failureCode?: string;

  @Prop({ required: true })
  requestId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PrivacyJobDocument = HydratedDocument<PrivacyJob>;
export const PrivacyJobSchema = SchemaFactory.createForClass(PrivacyJob);
PrivacyJobSchema.index({ userId: 1, type: 1, createdAt: -1 });
PrivacyJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
