import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';

@Schema({
  timestamps: true,
  collection: 'ai_provider_executions',
  versionKey: false,
})
export class ProviderExecution {
  @Prop({ type: Types.ObjectId })
  verificationId?: Types.ObjectId;

  @Prop({ required: true })
  requestId!: string;

  @Prop({ enum: AiProviderName, required: true })
  provider!: AiProviderName;

  @Prop({ enum: AiProviderName })
  primaryProvider?: AiProviderName;

  @Prop({ enum: AiCapability, required: true })
  capability!: AiCapability;

  @Prop({ required: true })
  model!: string;

  @Prop({ required: true })
  promptKey!: string;

  @Prop({ required: true })
  promptVersion!: number;

  @Prop({ required: true })
  outputSchemaVersion!: string;

  @Prop({ required: true })
  inputFingerprint!: string;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true })
  endedAt!: Date;

  @Prop({ required: true })
  latencyMs!: number;

  @Prop({ required: true })
  success!: boolean;

  @Prop()
  safeFailureCode?: string;

  @Prop()
  providerRequestId?: string;

  @Prop()
  inputTokens?: number;

  @Prop()
  outputTokens?: number;

  @Prop()
  totalTokens?: number;

  @Prop({ required: true })
  attempt!: number;

  @Prop({ required: true })
  deleteAfter!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProviderExecutionDocument = HydratedDocument<ProviderExecution>;
export const ProviderExecutionSchema =
  SchemaFactory.createForClass(ProviderExecution);
ProviderExecutionSchema.index({ verificationId: 1, createdAt: -1 });
ProviderExecutionSchema.index({ provider: 1, success: 1, createdAt: -1 });
ProviderExecutionSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });
