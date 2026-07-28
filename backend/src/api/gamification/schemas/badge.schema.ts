import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BadgeCriteriaType } from '../enums/gamification.enum';

export type BadgeDocument = HydratedDocument<Badge>;

@Schema({ timestamps: true, collection: 'badges', versionKey: false })
export class Badge {
  @Prop({ required: true })
  name!: string;
  @Prop({ required: true, unique: true, index: true })
  slug!: string;
  @Prop({ required: true })
  description!: string;
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
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
}
export const BadgeSchema = SchemaFactory.createForClass(Badge);
