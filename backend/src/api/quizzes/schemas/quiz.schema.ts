import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuizQuestionType, QuizStatus } from '../enums/quiz.enum';

@Schema({ _id: false })
export class QuizOption {
  @Prop({ required: true })
  id!: string;
  @Prop({ required: true })
  text!: string;
}

@Schema({ _id: false })
export class QuizQuestion {
  @Prop({ required: true })
  id!: string;
  @Prop({ required: true, enum: QuizQuestionType })
  type!: QuizQuestionType;
  @Prop({ required: true })
  prompt!: string;
  @Prop({ type: [SchemaFactory.createForClass(QuizOption)], required: true })
  options!: QuizOption[];
  @Prop({ type: [String], required: true })
  correctOptionIds!: string[];
  @Prop({ required: true })
  explanation!: string;
}

export type QuizDocument = HydratedDocument<Quiz>;

@Schema({ timestamps: true, collection: 'quizzes', versionKey: false })
export class Quiz {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  courseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  lessonId!: Types.ObjectId;
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  description!: string;
  @Prop({ required: true, min: 0, max: 100 })
  passingScore!: number;
  @Prop({ type: Object, required: true })
  attemptPolicy!: { maxAttempts: number };
  @Prop({ type: Object, default: {} })
  rewardPolicy!: Record<string, unknown>;
  @Prop({ required: true, enum: QuizStatus, index: true })
  status!: QuizStatus;
  @Prop({
    type: [SchemaFactory.createForClass(QuizQuestion)],
    required: true,
  })
  questions!: QuizQuestion[];
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  updatedBy!: Types.ObjectId;
  @Prop()
  publishedAt?: Date;
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);
