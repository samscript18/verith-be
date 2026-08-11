import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RewardTransactionType } from '../enums/gamification.enum';

export type RewardTransactionDocument = HydratedDocument<RewardTransaction>;

@Schema({
  timestamps: true,
  collection: 'reward_transactions',
  versionKey: false,
})
export class RewardTransaction {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, enum: RewardTransactionType, index: true })
  type!: RewardTransactionType;
  @Prop({ required: true })
  idempotencyReference!: string;
  @Prop({ required: true })
  xp!: number;
  @Prop({ required: true })
  truthPoints!: number;
  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;
  createdAt!: Date;
  updatedAt!: Date;
}

export const RewardTransactionSchema =
  SchemaFactory.createForClass(RewardTransaction);
RewardTransactionSchema.index(
  { userId: 1, idempotencyReference: 1 },
  { unique: true },
);
RewardTransactionSchema.index({ userId: 1, createdAt: -1, _id: -1 });
RewardTransactionSchema.index({ createdAt: -1, userId: 1 });
