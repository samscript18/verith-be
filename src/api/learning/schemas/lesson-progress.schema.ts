import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LessonProgressStatus } from '../enums/learning.enum';

export type LessonProgressDocument = HydratedDocument<LessonProgress>;

@Schema({
  timestamps: true,
  collection: 'lesson_progress',
  versionKey: false,
})
export class LessonProgress {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  courseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  lessonId!: Types.ObjectId;
  @Prop({ required: true, enum: LessonProgressStatus })
  status!: LessonProgressStatus;
  @Prop({ required: true, min: 0, max: 100 })
  progress!: number;
  @Prop()
  startedAt?: Date;
  @Prop()
  completedAt?: Date;
  @Prop({ default: 0, min: 0 })
  lastPosition!: number;
  @Prop({ default: 0, min: 0 })
  attemptCount!: number;
}

export const LessonProgressSchema =
  SchemaFactory.createForClass(LessonProgress);
LessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
