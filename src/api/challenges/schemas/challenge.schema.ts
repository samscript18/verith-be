import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import { ChallengeDifficulty, ChallengeStatus } from '../enums/challenge.enum';
import {
  ChallengeGenerationMode,
  ChallengeGenerationValidationStatus,
  DailyChallengeCompetency,
  DailyChallengeTopic,
} from '../enums/daily-challenge.enum';

export type ChallengeDocument = HydratedDocument<Challenge>;

@Schema({ timestamps: true, collection: 'challenges', versionKey: false })
export class Challenge {
  @Prop({ index: true })
  dailyDateKey?: string;
  @Prop()
  dailyContentVersion?: number;
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true, unique: true, index: true })
  slug!: string;
  @Prop({ required: true })
  scenario!: string;
  @Prop({ required: true })
  content!: string;
  @Prop({ type: [String], default: [], index: true })
  tags!: string[];
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
        competency: { type: String, enum: DailyChallengeCompetency },
        secondaryCompetencies: [
          { type: String, enum: DailyChallengeCompetency },
        ],
        topic: { type: String, enum: DailyChallengeTopic },
        educationalObjective: String,
        normalizedSignature: String,
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
    competency?: DailyChallengeCompetency;
    secondaryCompetencies?: DailyChallengeCompetency[];
    topic?: DailyChallengeTopic;
    educationalObjective?: string;
    normalizedSignature?: string;
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
  @Prop()
  notificationBroadcastAt?: Date;
  @Prop({ default: 'en' })
  language?: string;
  @Prop({
    type: {
      mode: { type: String, enum: ChallengeGenerationMode, required: true },
      provider: String,
      model: String,
      generatedAt: Date,
      generatorVersion: { type: String, required: true },
      validationVersion: String,
      validationStatus: {
        type: String,
        enum: ChallengeGenerationValidationStatus,
      },
      fallbackReason: String,
      topicCoverage: [{ type: String, enum: DailyChallengeTopic }],
      competencyCoverage: [{ type: String, enum: DailyChallengeCompetency }],
      _id: false,
    },
  })
  generation?: {
    mode: ChallengeGenerationMode;
    provider?: string;
    model?: string;
    generatedAt?: Date;
    generatorVersion: string;
    validationVersion?: string;
    validationStatus?: ChallengeGenerationValidationStatus;
    fallbackReason?: string;
    topicCoverage?: DailyChallengeTopic[];
    competencyCoverage?: DailyChallengeCompetency[];
  };
}
export const ChallengeSchema = SchemaFactory.createForClass(Challenge);
ChallengeSchema.index({ status: 1, publishAt: 1, expiresAt: 1 });
ChallengeSchema.index({ status: 1, difficulty: 1, _id: -1 });
