import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  BadgeAvailability,
  BadgeCriteriaType,
} from '../enums/gamification.enum';

export type BadgeDocument = HydratedDocument<Badge>;

@Schema({ timestamps: true, collection: 'badges', versionKey: false })
export class Badge {
  @Prop({ unique: true, sparse: true, index: true })
  code?: string;
  @Prop({ required: true })
  name!: string;
  @Prop({ required: true, unique: true, index: true })
  slug!: string;
  @Prop({ required: true })
  description!: string;
  @Prop()
  whyItMatters?: string;
  @Prop()
  iconKey?: string;
  @Prop({ type: Types.ObjectId })
  iconAssetId?: Types.ObjectId;
  @Prop({ required: true })
  category!: string;
  @Prop({ required: true, enum: BadgeCriteriaType })
  criteriaType!: BadgeCriteriaType;
  @Prop({ type: Object, required: true })
  criteria!: Record<string, unknown>;
  @Prop({ required: true })
  rarity!: string;
  @Prop({ type: Object, default: {} })
  reward!: { xp?: number; truthPoints?: number };
  @Prop({ default: true, index: true })
  active!: boolean;
  @Prop({ default: 100 })
  sortOrder!: number;
  @Prop({ enum: BadgeAvailability, default: BadgeAvailability.AVAILABLE })
  availability!: BadgeAvailability;
  // Fixed system badges do not require a human author. Admin-created badges
  // continue to record their actor through the service and audit ledger.
  @Prop({ type: Types.ObjectId })
  createdBy!: Types.ObjectId;
}
export const BadgeSchema = SchemaFactory.createForClass(Badge);
BadgeSchema.index({ active: 1, category: 1, _id: -1 });
BadgeSchema.index({ active: 1, sortOrder: 1, _id: 1 });
