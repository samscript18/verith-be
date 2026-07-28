import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  NotificationDeliveryStatus,
  NotificationType,
} from '../enums/notification.enum';

export type NotificationDocument = HydratedDocument<Notification>;
@Schema({ timestamps: true, collection: 'notifications', versionKey: false })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, enum: NotificationType, index: true })
  type!: NotificationType;
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  message!: string;
  @Prop()
  actionUrl?: string;
  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
  @Prop({ required: true })
  idempotencyReference!: string;
  @Prop()
  readAt?: Date;
  @Prop()
  deletedAt?: Date;
  @Prop({ required: true, enum: NotificationDeliveryStatus })
  emailStatus!: NotificationDeliveryStatus;
  @Prop()
  emailMessageId?: string;
  @Prop()
  emailFailureCode?: string;
  @Prop({ default: 0 })
  emailAttempts!: number;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index(
  { userId: 1, idempotencyReference: 1 },
  { unique: true },
);
NotificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
