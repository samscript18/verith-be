import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserBadgeDocument = HydratedDocument<UserBadge>;

@Schema({ timestamps: true, collection: 'user_badges', versionKey: false })
export class UserBadge {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  badgeId!: Types.ObjectId;
  @Prop({ required: true })
  idempotencyReference!: string;
  @Prop({ type: Object, default: {} })
  context!: Record<string, unknown>;
}
export const UserBadgeSchema = SchemaFactory.createForClass(UserBadge);
UserBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });
