import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MissionParticipantStatus } from '../enums/mission.enum';

@Schema({ _id: false })
export class MissionScenarioResponse {
  @Prop({ required: true }) scenarioId!: string;
  @Prop({ required: true }) reflection!: string;
  @Prop({ required: true }) completedAt!: Date;
}
const MissionScenarioResponseSchema = SchemaFactory.createForClass(
  MissionScenarioResponse,
);

@Schema({
  timestamps: true,
  collection: 'mission_participants',
  versionKey: 'version',
})
export class MissionParticipant {
  @Prop({ type: Types.ObjectId, required: true }) missionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ enum: MissionParticipantStatus, required: true })
  status!: MissionParticipantStatus;
  @Prop() consentedAt?: Date;
  @Prop() baselineScore?: number;
  @Prop() followUpScore?: number;
  @Prop({ type: [String], default: [] }) completedScenarioIds!: string[];
  @Prop({ type: [MissionScenarioResponseSchema], default: [], select: false })
  scenarioResponses!: MissionScenarioResponse[];
  @Prop() completedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
export type MissionParticipantDocument = HydratedDocument<MissionParticipant>;
export const MissionParticipantSchema =
  SchemaFactory.createForClass(MissionParticipant);
MissionParticipantSchema.index({ missionId: 1, userId: 1 }, { unique: true });
