import type Joi from 'joi';
import type { AiCapability } from '../enums/ai-capability.enum';
import type { AiProviderName } from '../enums/ai-provider-name.enum';

export interface AiRouterRequest<TOutput> {
  capability: AiCapability;
  promptKey: string;
  variables: Record<string, string>;
  outputSchemaName: string;
  outputSchemaVersion: string;
  outputJsonSchema: Record<string, unknown>;
  outputValidator: Joi.Schema<TOutput>;
  requestId: string;
  verificationId?: string;
  preferredProvider?: AiProviderName;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiRouterResult<TOutput> {
  output: TOutput;
  provider: AiProviderName;
  primaryProvider: AiProviderName;
  fallbackUsed: boolean;
  model: string;
  promptVersion: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}
