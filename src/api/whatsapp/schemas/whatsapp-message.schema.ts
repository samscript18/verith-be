import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  WhatsAppDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '../enums/whatsapp.enum';

export type WhatsAppMessageDocument = HydratedDocument<WhatsAppMessage>;
@Schema({
  timestamps: true,
  collection: 'whatsapp_messages',
  versionKey: false,
})
export class WhatsAppMessage {
  @Prop({ required: true, unique: true, index: true })
  wamid!: string;
  @Prop({ required: true, index: true })
  phoneNumberHash!: string;
  @Prop({ type: Types.ObjectId, index: true })
  linkedUserId?: Types.ObjectId;
  @Prop({ required: true, enum: WhatsAppDirection })
  direction!: WhatsAppDirection;
  @Prop({ required: true, enum: WhatsAppMessageType })
  messageType!: WhatsAppMessageType;
  @Prop({ required: true, enum: WhatsAppMessageStatus, index: true })
  status!: WhatsAppMessageStatus;
  @Prop()
  mediaId?: string;
  @Prop({ type: Types.ObjectId })
  verificationId?: Types.ObjectId;
  @Prop()
  receivedAt?: Date;
  @Prop()
  sentAt?: Date;
  @Prop()
  deliveredAt?: Date;
  @Prop()
  readAt?: Date;
  @Prop()
  failedAt?: Date;
  @Prop()
  failureCode?: string;
}
export const WhatsAppMessageSchema =
  SchemaFactory.createForClass(WhatsAppMessage);
WhatsAppMessageSchema.index({ linkedUserId: 1, createdAt: -1 });
