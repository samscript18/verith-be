import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QuizAttemptDocument = HydratedDocument<QuizAttempt>;

@Schema({ timestamps: true, collection: 'quiz_attempts', versionKey: false })
export class QuizAttempt {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  quizId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  courseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  lessonId!: Types.ObjectId;
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
  @Prop({ default: 'PENDING' })
  rewardState!: string;
}

export const QuizAttemptSchema = SchemaFactory.createForClass(QuizAttempt);
QuizAttemptSchema.index(
  { userId: 1, quizId: 1, attemptNumber: 1 },
  { unique: true },
);
