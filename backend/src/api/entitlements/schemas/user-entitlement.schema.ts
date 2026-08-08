import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { EntitlementPlan } from '../enums/entitlement-plan.enum';

@Schema({
  timestamps: true,
  collection: 'user_entitlements',
  versionKey: 'version',
})
export class UserEntitlement {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  userId!: Types.ObjectId;
  @Prop({ enum: EntitlementPlan, required: true }) plan!: EntitlementPlan;
  @Prop({ type: Object, default: {} }) overrides!: Record<string, unknown>;
  @Prop({ type: Types.ObjectId, required: true }) grantedBy!: Types.ObjectId;
  @Prop({ required: true }) reason!: string;
  @Prop({ required: true }) startsAt!: Date;
  @Prop() expiresAt?: Date;
  @Prop() revokedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
export const UserEntitlementSchema =
  SchemaFactory.createForClass(UserEntitlement);
UserEntitlementSchema.index({ expiresAt: 1 });
