import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChallengeAttemptDocument = HydratedDocument<ChallengeAttempt>;

@Schema({
  timestamps: true,
  collection: 'challenge_attempts',
  versionKey: false,
})
export class ChallengeAttempt {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  challengeId!: Types.ObjectId;
  @Prop({ required: true })
  attemptNumber!: number;
  @Prop({ type: [Object], required: true })
  answers!: Array<{ questionId: string; selectedOptionIds: string[] }>;
  @Prop({ required: true, min: 0, max: 100 })
  score!: number;
  @Prop({ required: true })
  passed!: boolean;
  @Prop({ type: [Object], required: true })
  results!: Array<{
    questionId: string;
    correct: boolean;
    explanation: string;
  }>;
  @Prop({ required: true })
  rewardState!: string;
}
export const ChallengeAttemptSchema =
  SchemaFactory.createForClass(ChallengeAttempt);
ChallengeAttemptSchema.index(
  { userId: 1, challengeId: 1, attemptNumber: 1 },
  { unique: true },
);
