import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AssessmentPhase } from '../enums/mission.enum';

@Schema({
  timestamps: true,
  collection: 'mission_assessment_attempts',
  versionKey: false,
})
export class MissionAssessmentAttempt {
  @Prop({ type: Types.ObjectId, required: true }) missionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) assessmentId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ enum: AssessmentPhase, required: true }) phase!: AssessmentPhase;
  @Prop({ required: true }) attemptNumber!: number;
  @Prop({ type: [Object], required: true }) answers!: Array<{
    questionId: string;
    selectedOptionIds: string[];
  }>;
  @Prop({ required: true }) score!: number;
  @Prop({ required: true }) passed!: boolean;
  @Prop({ type: [Object], required: true }) competencyScores!: Array<{
    competency: string;
    score: number;
  }>;
}
export type MissionAssessmentAttemptDocument =
  HydratedDocument<MissionAssessmentAttempt>;
export const MissionAssessmentAttemptSchema = SchemaFactory.createForClass(
  MissionAssessmentAttempt,
);
MissionAssessmentAttemptSchema.index(
  { userId: 1, assessmentId: 1, attemptNumber: 1 },
  { unique: true },
);
