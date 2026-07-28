import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CourseStatus, LearningDifficulty } from '../enums/learning.enum';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true, collection: 'courses', versionKey: false })
export class Course {
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true, unique: true, index: true })
  slug!: string;
  @Prop({ required: true })
  description!: string;
  @Prop({ type: Types.ObjectId })
  thumbnailAssetId?: Types.ObjectId;
  @Prop({ required: true, enum: LearningDifficulty })
  difficulty!: LearningDifficulty;
  @Prop({ required: true, min: 1 })
  estimatedDuration!: number;
  @Prop({ type: [String], default: [] })
  learningObjectives!: string[];
  @Prop({ type: [String], default: [], index: true })
  tags!: string[];
  @Prop({ type: [Types.ObjectId], default: [] })
  lessonIds!: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], default: [] })
  prerequisiteCourseIds!: Types.ObjectId[];
  @Prop({ required: true, enum: CourseStatus, index: true })
  status!: CourseStatus;
  @Prop()
  publishedAt?: Date;
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  updatedBy!: Types.ObjectId;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
CourseSchema.index({ status: 1, publishedAt: -1 });
