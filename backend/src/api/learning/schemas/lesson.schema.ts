import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LessonStatus } from '../enums/learning.enum';

export type LessonDocument = HydratedDocument<Lesson>;

@Schema({ timestamps: true, collection: 'lessons', versionKey: false })
export class Lesson {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  courseId!: Types.ObjectId;
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  slug!: string;
  @Prop({ required: true })
  summary!: string;
  @Prop({ required: true })
  sanitizedHtml!: string;
  @Prop({ required: true, min: 1 })
  estimatedDuration!: number;
  @Prop({ required: true, min: 1 })
  sequence!: number;
  @Prop({ type: [String], default: [] })
  tags!: string[];
  @Prop({ required: true, enum: LessonStatus, index: true })
  status!: LessonStatus;
  @Prop()
  publishedAt?: Date;
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  updatedBy!: Types.ObjectId;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
LessonSchema.index({ courseId: 1, slug: 1 }, { unique: true });
LessonSchema.index({ courseId: 1, sequence: 1 }, { unique: true });
