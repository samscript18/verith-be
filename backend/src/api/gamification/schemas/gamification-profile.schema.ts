import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GamificationProfileDocument = HydratedDocument<GamificationProfile>;

@Schema({
  timestamps: true,
  collection: 'gamification_profiles',
  versionKey: false,
})
export class GamificationProfile {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ default: 0, min: 0 })
  xp!: number;
  @Prop({ default: 0, min: 0 })
  truthPoints!: number;
  @Prop({ default: 1, min: 1 })
  level!: number;
  @Prop({ default: 0, min: 0 })
  currentStreak!: number;
  @Prop({ default: 0, min: 0 })
  longestStreak!: number;
  @Prop()
  lastEligibleActivityDate?: string;
  @Prop({ default: 0, min: 0 })
  badgesCount!: number;
  @Prop({ default: true })
  leaderboardEligible!: boolean;
  @Prop({ default: 0, min: 0 })
  achievementCatalogVersion!: number;
  /**
   * Source-watermarks used to stop an older asynchronous recalculation from
   * overwriting a projection produced from a newer reward ledger snapshot.
   */
  @Prop({ default: 0, min: 0 })
  projectionTransactionCount!: number;
  @Prop({ default: 0, min: 0 })
  projectionBadgeOwnershipCount!: number;
}

export const GamificationProfileSchema =
  SchemaFactory.createForClass(GamificationProfile);
GamificationProfileSchema.index({ xp: -1, truthPoints: -1 });
