import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import { ChallengeDifficulty, ChallengeStatus } from '../enums/challenge.enum';

export type ChallengeDocument = HydratedDocument<Challenge>;

@Schema({ timestamps: true, collection: 'challenges', versionKey: false })
export class Challenge {
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true, unique: true, index: true })
  slug!: string;
  @Prop({ required: true })
  scenario!: string;
  @Prop({ required: true })
  content!: string;
  @Prop({ type: Types.ObjectId })
  mediaAssetId?: Types.ObjectId;
  @Prop({
    type: [
      {
        id: String,
        type: { type: String, enum: QuizQuestionType },
        prompt: String,
        options: [{ id: String, text: String, _id: false }],
        correctOptionIds: [String],
        explanation: String,
        _id: false,
      },
    ],
    required: true,
  })
  questions!: Array<{
    id: string;
    type: QuizQuestionType;
    prompt: string;
    options: Array<{ id: string; text: string }>;
    correctOptionIds: string[];
    explanation: string;
  }>;
  @Prop({ required: true, enum: ChallengeDifficulty })
  difficulty!: ChallengeDifficulty;
  @Prop({ type: Object, required: true })
  rewardPolicy!: { xp: number; truthPoints: number };
  @Prop({ required: true, min: 1, max: 100 })
  maxAttempts!: number;
  @Prop({ required: true, min: 0, max: 100 })
  passingScore!: number;
  @Prop({ required: true, index: true })
  publishAt!: Date;
  @Prop({ required: true, index: true })
  expiresAt!: Date;
  @Prop({ required: true, enum: ChallengeStatus, index: true })
  status!: ChallengeStatus;
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
}
export const ChallengeSchema = SchemaFactory.createForClass(Challenge);
ChallengeSchema.index({ status: 1, publishAt: 1, expiresAt: 1 });
