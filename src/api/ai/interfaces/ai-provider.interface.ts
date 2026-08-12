import type { ProviderState } from '../../../shared/enums/provider-state.enum';
import type { AiCapability } from '../enums/ai-capability.enum';
import type { AiProviderName } from '../enums/ai-provider-name.enum';

export interface AiExecutionRequest {
  capability: AiCapability;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  outputSchemaName: string;
  outputJsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  media?: { mimeType: string; base64Data: string };
}

export interface AiTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiProviderResult {
  output: unknown;
  model: string;
  usage: AiTokenUsage;
  providerRequestId?: string;
}

export interface ProviderHealthResult {
  provider: AiProviderName;
  state: ProviderState;
  checkedAt: Date;
  latencyMs: number;
  safeCode?: string;
  configuredKeys?: number;
  healthyKeys?: number;
  cooldownKeys?: number;
  disabledKeys?: number;
  nextAvailableAt?: Date;
}

export interface AiProvider {
  readonly provider: AiProviderName;
  readonly configured: boolean;
  supports(capability: AiCapability): boolean;
  modelFor(capability: AiCapability): string | null;
  execute(request: AiExecutionRequest): Promise<AiProviderResult>;
  healthCheck(): Promise<ProviderHealthResult>;
}

export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
