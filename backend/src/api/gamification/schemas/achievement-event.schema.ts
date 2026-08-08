import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AchievementEventType, RankCode } from '../enums/gamification.enum';

export type AchievementEventDocument = HydratedDocument<AchievementEvent>;

@Schema({
  timestamps: true,
  collection: 'achievement_events',
  versionKey: false,
})
export class AchievementEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ enum: AchievementEventType, required: true, index: true })
  type!: AchievementEventType;
  @Prop({ required: true })
  idempotencyReference!: string;
  @Prop({ type: Types.ObjectId })
  badgeId?: Types.ObjectId;
  @Prop()
  badgeCode?: string;
  @Prop()
  badgeName?: string;
  @Prop({ enum: RankCode })
  fromRank?: RankCode;
  @Prop({ enum: RankCode })
  toRank?: RankCode;
  @Prop()
  sourceActivityType?: string;
  @Prop()
  sourceActivityId?: string;
  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
  @Prop()
  celebrationClaimedAt?: Date;
  @Prop()
  celebrationClaimToken?: string;
  @Prop()
  celebrationSeenAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const AchievementEventSchema =
  SchemaFactory.createForClass(AchievementEvent);
AchievementEventSchema.index(
  { userId: 1, idempotencyReference: 1 },
  { unique: true },
);
AchievementEventSchema.index({ userId: 1, celebrationSeenAt: 1, createdAt: 1 });
