import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WhatsAppLinkDocument = HydratedDocument<WhatsAppLink>;
@Schema({ timestamps: true, collection: 'whatsapp_links', versionKey: false })
export class WhatsAppLink {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, unique: true, sparse: true, select: false })
  phoneNumberEncrypted?: string;
  @Prop({ unique: true, sparse: true, index: true })
  phoneNumberHash?: string;
  @Prop({ select: false })
  linkCodeHash?: string;
  @Prop()
  linkCodeExpiresAt?: Date;
  @Prop()
  linkedAt?: Date;
  @Prop()
  unlinkedAt?: Date;
  @Prop({ default: false })
  consented!: boolean;
}
export const WhatsAppLinkSchema = SchemaFactory.createForClass(WhatsAppLink);
WhatsAppLinkSchema.index({ linkCodeExpiresAt: 1 }, { expireAfterSeconds: 0 });
