import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AiProviderName } from '../enums/ai-provider-name.enum';

@Schema({
  timestamps: true,
  collection: 'ai_provider_runtime_config',
  versionKey: false,
})
export class ProviderRuntimeConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ type: [String], enum: AiProviderName, required: true })
  enabledProviders!: AiProviderName[];

  @Prop({ type: [String], enum: AiProviderName, required: true })
  defaultOrder!: AiProviderName[];

  @Prop({ required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProviderRuntimeConfigDocument =
  HydratedDocument<ProviderRuntimeConfig>;
export const ProviderRuntimeConfigSchema = SchemaFactory.createForClass(
  ProviderRuntimeConfig,
);
