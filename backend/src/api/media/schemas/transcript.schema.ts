import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TranscriptStatus } from '../enums/media.enum';

export type TranscriptDocument = HydratedDocument<Transcript>;

@Schema({ timestamps: true, collection: 'transcripts', versionKey: false })
export class Transcript {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  verificationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true })
  mediaAssetId!: Types.ObjectId;
  @Prop({ required: true })
  provider!: string;
  @Prop({ required: true })
  language!: string;
  @Prop({ min: 0 })
  duration?: number;
  @Prop({ required: true })
  fullText!: string;
  @Prop({ type: [Object], default: [] })
  segments!: Record<string, unknown>[];
  @Prop({ min: 0, max: 1 })
  averageConfidence?: number;
  @Prop()
  translation?: string;
  @Prop({ required: true, enum: TranscriptStatus })
  status!: TranscriptStatus;
  @Prop({ type: [String], default: [] })
  limitations!: string[];
}

export const TranscriptSchema = SchemaFactory.createForClass(Transcript);
