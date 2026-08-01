import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  AiContentIndicator,
  MediaAnalysisStatus,
  ReverseImageStatus,
} from '../enums/media.enum';

export type MediaAnalysisDocument = HydratedDocument<MediaAnalysis>;

@Schema({ timestamps: true, collection: 'media_analyses', versionKey: false })
export class MediaAnalysis {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  verificationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  mediaAssetId!: Types.ObjectId;
  @Prop({ required: true, enum: MediaAnalysisStatus })
  status!: MediaAnalysisStatus;
  @Prop({ required: true })
  provider!: string;
  @Prop({ required: true })
  fullText!: string;
  @Prop({ enum: ['IMAGE', 'VIDEO'] })
  mediaKind?: 'IMAGE' | 'VIDEO';
  @Prop()
  spokenText?: string;
  @Prop({ type: [Object], default: [] })
  blocks!: Record<string, unknown>[];
  @Prop({ type: [String], default: [] })
  lines!: string[];
  @Prop({ required: true })
  language!: string;
  @Prop({ min: 0, max: 1 })
  confidence?: number;
  @Prop({ type: [String], default: [] })
  uncertainRegions!: string[];
  @Prop({ type: [String], default: [] })
  visibleDates!: string[];
  @Prop({ type: [String], default: [] })
  visibleUrls!: string[];
  @Prop({ type: [String], default: [] })
  visiblePublisherNames!: string[];
  @Prop()
  likelyContentType?: string;
  @Prop()
  potentialCropping?: boolean;
  @Prop({ required: true, enum: AiContentIndicator })
  aiIndicator!: AiContentIndicator;
  @Prop({ required: true, min: 0, max: 1 })
  aiIndicatorConfidence!: number;
  @Prop({ type: [String], default: [] })
  aiObservations!: string[];
  @Prop({ type: [String], default: [] })
  aiLimitations!: string[];
  @Prop({ required: true })
  specializedDetectorUsed!: boolean;
  @Prop({ required: true, enum: ReverseImageStatus })
  reverseImageStatus!: ReverseImageStatus;
  @Prop({ type: [Object], default: [] })
  reverseImageMatches!: Record<string, unknown>[];
  @Prop({ type: [String], default: [] })
  limitations!: string[];
  @Prop({ required: true })
  promptVersion!: number;
}

export const MediaAnalysisSchema = SchemaFactory.createForClass(MediaAnalysis);
