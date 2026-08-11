import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { PromptStatus } from '../enums/prompt-status.enum';

@Schema({ timestamps: true, collection: 'ai_prompts', versionKey: false })
export class AiPrompt {
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true })
  task!: string;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ enum: PromptStatus, required: true })
  status!: PromptStatus;

  @Prop({ required: true })
  systemPrompt!: string;

  @Prop({ required: true })
  userPromptTemplate!: string;

  @Prop({ type: [String], enum: AiProviderName, required: true })
  supportedProviders!: AiProviderName[];

  @Prop({ type: [String], default: [] })
  supportedModels!: string[];

  @Prop({ required: true })
  outputSchemaVersion!: string;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true })
  publishedBy!: string;

  @Prop()
  publishedAt?: Date;

  @Prop()
  deprecatedAt?: Date;

  @Prop({ required: true })
  changeSummary!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AiPromptDocument = HydratedDocument<AiPrompt>;
export const AiPromptSchema = SchemaFactory.createForClass(AiPrompt);
AiPromptSchema.index({ key: 1, version: 1 }, { unique: true });
AiPromptSchema.index({ key: 1, status: 1, version: -1 });
