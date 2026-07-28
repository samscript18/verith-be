import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VerificationEventStatus } from '../enums/verification-event-status.enum';
import { VerificationStage } from '../enums/verification-stage.enum';

@Schema({
  timestamps: false,
  collection: 'verification_events',
  versionKey: false,
})
export class VerificationEvent {
  @Prop({ type: Types.ObjectId, required: true })
  verificationId!: Types.ObjectId;

  @Prop({ enum: VerificationStage, required: true })
  stage!: VerificationStage;

  @Prop({ enum: VerificationEventStatus, required: true })
  status!: VerificationEventStatus;

  @Prop({ min: 0, max: 100, required: true })
  progress!: number;

  @Prop({ required: true })
  messageCode!: string;

  @Prop({ required: true, maxlength: 300 })
  safeMessage!: string;

  @Prop({ type: Object })
  metrics?: Record<string, number>;

  @Prop({ required: true })
  occurredAt!: Date;

  @Prop({ required: true, min: 1 })
  sequence!: number;

  @Prop({ required: true })
  requestId!: string;

  @Prop()
  jobId?: string;
}

export type VerificationEventDocument = HydratedDocument<VerificationEvent>;
export const VerificationEventSchema =
  SchemaFactory.createForClass(VerificationEvent);
VerificationEventSchema.index(
  { verificationId: 1, sequence: 1 },
  { unique: true },
);
VerificationEventSchema.index({ verificationId: 1, occurredAt: 1 });
