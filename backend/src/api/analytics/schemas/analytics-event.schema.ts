import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AnalyticsEventType } from '../enums/analytics-event.enum';

@Schema({ timestamps: true, collection: 'analytics_events', versionKey: false })
export class AnalyticsEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ enum: AnalyticsEventType, required: true, index: true })
  event!: AnalyticsEventType;
  @Prop({ type: Types.ObjectId, index: true }) verificationId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) reportId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) missionId?: Types.ObjectId;
  @Prop() sourceType?: string;
  @Prop() mode?: string;
  @Prop() feature?: string;
  createdAt!: Date;
}
export const AnalyticsEventSchema =
  SchemaFactory.createForClass(AnalyticsEvent);
AnalyticsEventSchema.index({ createdAt: -1, event: 1 });
