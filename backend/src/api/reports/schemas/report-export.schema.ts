import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReportExportFormat, ReportExportStatus } from '../enums/report.enum';

export type ReportExportDocument = HydratedDocument<ReportExport>;

@Schema({ timestamps: true, collection: 'report_exports', versionKey: false })
export class ReportExport {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  reportId!: Types.ObjectId;
  @Prop({ required: true, enum: ReportExportFormat })
  format!: ReportExportFormat;
  @Prop({ required: true, enum: ReportExportStatus })
  status!: ReportExportStatus;
  @Prop()
  contentHash?: string;
  @Prop()
  bytes?: number;
  @Prop()
  expiresAt?: Date;
  @Prop()
  failureCode?: string;
  @Prop()
  completedAt?: Date;
}

export const ReportExportSchema = SchemaFactory.createForClass(ReportExport);
