import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MissionDifficulty, MissionStatus } from '../enums/mission.enum';

@Schema({ _id: false })
export class MissionScenario {
  @Prop({ required: true }) id!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) description!: string;
  @Prop({ required: true }) synthetic!: boolean;
  @Prop({ type: [String], default: [] }) competencies!: string[];
}
const MissionScenarioSchema = SchemaFactory.createForClass(MissionScenario);

@Schema({ timestamps: true, collection: 'missions', versionKey: 'version' })
export class Mission {
  @Prop({ required: true }) title!: string;
  @Prop({ required: true, unique: true }) slug!: string;
  @Prop({ required: true }) summary!: string;
  @Prop({ required: true }) topic!: string;
  @Prop({ required: true }) audience!: string;
  @Prop({ enum: MissionDifficulty, required: true })
  difficulty!: MissionDifficulty;
  @Prop({ required: true }) startsAt!: Date;
  @Prop({ required: true }) endsAt!: Date;
  @Prop({ enum: MissionStatus, required: true }) status!: MissionStatus;
  @Prop({ type: [MissionScenarioSchema], default: [] })
  scenarios!: MissionScenario[];
  @Prop({ type: [Types.ObjectId], default: [] }) lessonIds!: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], default: [] })
  challengeIds!: Types.ObjectId[];
  @Prop({ type: Object, required: true }) rewardPolicy!: {
    xp: number;
    truthPoints: number;
  };
  @Prop({ type: Object, required: true }) completionCriteria!: Record<
    string,
    number | boolean
  >;
  @Prop({ required: true }) organization!: string;
  @Prop({ required: true }) privacyPolicy!: string;
  @Prop({ default: true }) consentRequired!: boolean;
  @Prop({ type: Types.ObjectId, required: true }) createdBy!: Types.ObjectId;
}
export type MissionDocument = HydratedDocument<Mission>;
export const MissionSchema = SchemaFactory.createForClass(Mission);
MissionSchema.index({ status: 1, startsAt: 1, endsAt: 1 });
