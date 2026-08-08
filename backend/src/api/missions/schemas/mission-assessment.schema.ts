import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import { AssessmentPhase, MissionQuestionType } from '../enums/mission.enum';

@Schema({ _id: false })
export class MissionAssessmentQuestion {
  @Prop({ required: true }) id!: string;
  @Prop({ enum: MissionQuestionType, required: true })
  type!: MissionQuestionType;
  @Prop({ required: true }) prompt!: string;
  @Prop({ type: [{ id: String, text: String, _id: false }], required: true })
  options!: Array<{ id: string; text: string }>;
  @Prop({ type: [String], required: true, select: false })
  correctOptionIds!: string[];
  @Prop({ required: true, select: false }) explanation!: string;
  @Prop({ enum: MediaLiteracyCompetency, required: true })
  competency!: MediaLiteracyCompetency;
}
const MissionAssessmentQuestionSchema = SchemaFactory.createForClass(
  MissionAssessmentQuestion,
);

@Schema({
  timestamps: true,
  collection: 'mission_assessments',
  versionKey: 'version',
})
export class MissionAssessment {
  @Prop({ type: Types.ObjectId, required: true }) missionId!: Types.ObjectId;
  @Prop({ enum: AssessmentPhase, required: true }) phase!: AssessmentPhase;
  @Prop({ required: true }) version!: number;
  @Prop({ type: [MissionAssessmentQuestionSchema], required: true })
  questions!: MissionAssessmentQuestion[];
  @Prop({ required: true, min: 0, max: 100 }) passingScore!: number;
  @Prop({ required: true, min: 1 }) maxAttempts!: number;
}
export type MissionAssessmentDocument = HydratedDocument<MissionAssessment>;
export const MissionAssessmentSchema =
  SchemaFactory.createForClass(MissionAssessment);
MissionAssessmentSchema.index(
  { missionId: 1, phase: 1, version: 1 },
  { unique: true },
);
