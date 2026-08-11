import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  GuidedInvestigationStatus,
  GuidedQuestionType,
  MediaLiteracyCompetency,
} from '../enums/guided-investigation.enum';

@Schema({ _id: false })
export class GuidedQuestionOption {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  label!: string;
}

const GuidedQuestionOptionSchema =
  SchemaFactory.createForClass(GuidedQuestionOption);

@Schema({ _id: false })
export class GuidedQuestion {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ enum: GuidedQuestionType, required: true })
  type!: GuidedQuestionType;

  @Prop({ required: true })
  prompt!: string;

  @Prop({ type: [GuidedQuestionOptionSchema], default: [] })
  options!: GuidedQuestionOption[];

  @Prop({ enum: MediaLiteracyCompetency, required: true })
  competency!: MediaLiteracyCompetency;

  @Prop({ type: [String], default: [], select: false })
  correctOptionIds!: string[];

  @Prop({ default: false })
  objectivelyScorable!: boolean;
}

const GuidedQuestionSchema = SchemaFactory.createForClass(GuidedQuestion);

@Schema({ _id: false })
export class GuidedResponse {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ type: [String], default: [] })
  selectedOptionIds!: string[];

  @Prop({ maxlength: 2000 })
  text?: string;

  @Prop({ min: 0 })
  responseTimeMs!: number;

  @Prop({ enum: MediaLiteracyCompetency, required: true })
  competency!: MediaLiteracyCompetency;

  @Prop({ min: 0, max: 1 })
  score?: number;

  @Prop({ required: true })
  submittedAt!: Date;
}

const GuidedResponseSchema = SchemaFactory.createForClass(GuidedResponse);

@Schema({ _id: false })
export class GuidedFeedback {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ required: true })
  heading!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ enum: MediaLiteracyCompetency, required: true })
  competency!: MediaLiteracyCompetency;
}

const GuidedFeedbackSchema = SchemaFactory.createForClass(GuidedFeedback);

@Schema({
  timestamps: true,
  collection: 'guided_investigations',
  versionKey: 'version',
})
export class GuidedInvestigation {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  verificationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  questionSetVersion!: number;

  @Prop({ enum: GuidedInvestigationStatus, required: true })
  status!: GuidedInvestigationStatus;

  @Prop({ type: [GuidedQuestionSchema], required: true })
  questions!: GuidedQuestion[];

  @Prop({ type: [GuidedResponseSchema], default: [] })
  responses!: GuidedResponse[];

  @Prop({ type: [GuidedFeedbackSchema], default: [] })
  feedback!: GuidedFeedback[];

  @Prop()
  submittedAt?: Date;

  @Prop()
  feedbackGeneratedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type GuidedInvestigationDocument = HydratedDocument<GuidedInvestigation>;
export const GuidedInvestigationSchema =
  SchemaFactory.createForClass(GuidedInvestigation);
GuidedInvestigationSchema.index({ userId: 1, createdAt: -1 });
