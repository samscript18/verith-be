import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalProviderException } from '../../../core/exceptions';
import type { AiConfig, BedrockAiConfig } from '../../../shared/config';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type {
  AiExecutionRequest,
  AiProvider,
  AiProviderResult,
  ProviderHealthResult,
} from '../interfaces/ai-provider.interface';
import { parseJsonText } from './provider-http';

@Injectable()
export class BedrockProvider implements AiProvider {
  readonly provider = AiProviderName.BEDROCK;
  readonly configured: boolean;
  private readonly config: BedrockAiConfig;
  private readonly client: BedrockRuntimeClient;
  private readonly capabilities = new Set([
    AiCapability.TEXT_REASONING,
    AiCapability.STRUCTURED_EXTRACTION,
    AiCapability.CLAIM_EXTRACTION,
    AiCapability.SUMMARIZATION,
    AiCapability.MANIPULATION_ANALYSIS,
    AiCapability.BIAS_ANALYSIS,
    AiCapability.CONTEXT_ANALYSIS,
    AiCapability.EVIDENCE_SYNTHESIS,
    AiCapability.REPORT_GENERATION,
    AiCapability.TRANSLATION,
  ]);

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AiConfig>('ai').bedrock;
    this.client = new BedrockRuntimeClient({ region: this.config.region });
    this.configured = Boolean(
      this.config.enabled &&
      this.config.region &&
      Object.values(this.config.models).some(Boolean),
    );
  }

  supports(capability: AiCapability): boolean {
    return this.configured && this.capabilities.has(capability);
  }

  modelFor(capability: AiCapability): string | null {
    let key = 'text';
    if (capability === AiCapability.TRANSLATION) key = 'localization';
    else if (
      [
        AiCapability.CONTEXT_ANALYSIS,
        AiCapability.EVIDENCE_SYNTHESIS,
        AiCapability.REPORT_GENERATION,
      ].includes(capability)
    )
      key = 'reasoning';
    const model = this.config.models[key] || this.config.models.text;
    return this.supports(capability) && model ? model : null;
  }

  async execute(request: AiExecutionRequest): Promise<AiProviderResult> {
    if (request.media)
      throw new ExternalProviderException(
        'This Bedrock adapter does not accept media',
        'BEDROCK_INVALID_REQUEST',
      );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: ConverseCommandOutput;
    try {
      response = await this.client.send(
        new ConverseCommand({
          modelId: request.model,
          system: [{ text: request.systemPrompt }],
          messages: [{ role: 'user', content: [{ text: request.userPrompt }] }],
          inferenceConfig: {
            maxTokens: request.maxOutputTokens,
            temperature: request.temperature ?? 0.1,
          },
          outputConfig: {
            textFormat: {
              type: 'json_schema',
              structure: {
                jsonSchema: {
                  name: request.outputSchemaName,
                  // Bedrock accepts a documented JSON Schema subset. Domain
                  // constraints stripped here are still enforced by the
                  // router's full Joi validator before anything is persisted.
                  schema: JSON.stringify(
                    bedrockOutputSchema(request.outputJsonSchema),
                  ),
                },
              },
            },
          },
        }),
        { abortSignal: controller.signal },
      );
    } catch (error) {
      throw this.normalizeFailure(error, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }
    const blocks = response.output?.message?.content ?? [];
    const text = blocks.find((block) => typeof block.text === 'string')?.text;
    if (!text)
      throw new ExternalProviderException(
        'Bedrock returned no usable content',
        'BEDROCK_INVALID_RESPONSE',
      );
    const usage = {
      ...(typeof response.usage?.inputTokens === 'number'
        ? { inputTokens: response.usage.inputTokens }
        : {}),
      ...(typeof response.usage?.outputTokens === 'number'
        ? { outputTokens: response.usage.outputTokens }
        : {}),
      ...(typeof response.usage?.totalTokens === 'number'
        ? { totalTokens: response.usage.totalTokens }
        : {}),
    };
    const providerRequestId = response.$metadata.requestId;
    return {
      output: parseJsonText(text, this.provider, {
        ...(response.stopReason === 'max_tokens'
          ? { invalidCode: 'BEDROCK_OUTPUT_TRUNCATED' }
          : {}),
        operatorDetails: {
          stopReason: response.stopReason ?? null,
          ...usage,
          providerRequestId: providerRequestId ?? null,
        },
      }),
      model: request.model,
      usage,
      ...(providerRequestId ? { providerRequestId } : {}),
    };
  }

  healthCheck(): Promise<ProviderHealthResult> {
    return Promise.resolve({
      provider: this.provider,
      state: this.configured
        ? ProviderState.CONFIGURED
        : ProviderState.NOT_CONFIGURED,
      checkedAt: new Date(),
      latencyMs: 0,
      ...(this.configured
        ? { safeCode: 'BEDROCK_RUNTIME_VALIDATED_ON_FIRST_INFERENCE' }
        : {}),
    });
  }

  private normalizeFailure(error: unknown, timedOut: boolean) {
    if (timedOut)
      return new ExternalProviderException(
        'Bedrock timed out',
        'BEDROCK_TIMEOUT',
      );
    const name = error instanceof Error ? error.name : '';
    const status =
      typeof error === 'object' && error !== null && '$metadata' in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined;
    if (
      status === 401 ||
      status === 403 ||
      ['UnrecognizedClientException', 'AccessDeniedException'].includes(name)
    )
      return new ExternalProviderException(
        'Bedrock authentication failed',
        'BEDROCK_AUTHENTICATION_FAILED',
      );
    if (status === 429 || name.includes('Throttl'))
      return new ExternalProviderException(
        'Bedrock is rate limited',
        'BEDROCK_RATE_LIMITED',
      );
    if (status === 400 || name.includes('Validation'))
      return new ExternalProviderException(
        'Bedrock rejected the request',
        'BEDROCK_INVALID_REQUEST',
      );
    if (status && status >= 500)
      return new ExternalProviderException(
        'Bedrock is temporarily unavailable',
        'BEDROCK_UNAVAILABLE',
      );
    return new ExternalProviderException(
      'Bedrock is unavailable',
      'BEDROCK_UNAVAILABLE',
    );
  }
}

const UNSUPPORTED_BEDROCK_SCHEMA_KEYS = new Set([
  'exclusiveMaximum',
  'exclusiveMinimum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'maximum',
  'minLength',
  'minProperties',
  'minimum',
  'multipleOf',
  'pattern',
]);

export function bedrockOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bedrockOutputSchema);
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (UNSUPPORTED_BEDROCK_SCHEMA_KEYS.has(key)) continue;
    if (key === 'minItems' && nested !== 0 && nested !== 1) continue;
    result[key] = bedrockOutputSchema(nested);
  }
  return result;
}
