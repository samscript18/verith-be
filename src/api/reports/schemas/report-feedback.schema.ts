import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ReportFeedbackStatus,
  ReportFeedbackType,
  ReportProblemCategory,
} from '../enums/report.enum';

export type ReportFeedbackDocument = HydratedDocument<ReportFeedback>;

@Schema({ timestamps: true, collection: 'report_feedback', versionKey: false })
export class ReportFeedback {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  reportId!: Types.ObjectId;
  @Prop({ required: true, enum: ReportFeedbackType })
  type!: ReportFeedbackType;
  @Prop({ enum: ReportProblemCategory })
  category?: ReportProblemCategory;
  @Prop()
  comment?: string;
  @Prop({ required: true, enum: ReportFeedbackStatus })
  status!: ReportFeedbackStatus;
  @Prop({ type: Types.ObjectId })
  assignedModeratorId?: Types.ObjectId;
  @Prop()
  resolution?: string;
  @Prop()
  resolvedAt?: Date;
}

export const ReportFeedbackSchema =
  SchemaFactory.createForClass(ReportFeedback);
ReportFeedbackSchema.index({ userId: 1, reportId: 1 }, { unique: true });
