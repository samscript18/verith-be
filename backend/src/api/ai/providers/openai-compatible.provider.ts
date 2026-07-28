import type { AiProviderConfig } from '../../../shared/config';
import { ExternalProviderException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import type { AiProviderName } from '../enums/ai-provider-name.enum';
import type {
  AiExecutionRequest,
  AiProvider,
  AiProviderResult,
  ProviderHealthResult,
} from '../interfaces/ai-provider.interface';
import { parseJsonText, providerFetch, readObject } from './provider-http';

export abstract class OpenAiCompatibleProvider implements AiProvider {
  abstract readonly provider: AiProviderName;
  abstract readonly capabilities: ReadonlySet<AiCapability>;
  abstract modelFor(capability: AiCapability): string | null;
  protected abstract extraHeaders(): Record<string, string>;
  protected providerPreferences(): Record<string, unknown> | undefined {
    return undefined;
  }

  readonly configured: boolean;

  protected constructor(protected readonly config: AiProviderConfig) {
    this.configured = Boolean(
      config.apiKey && Object.values(config.models).some(Boolean),
    );
  }

  supports(capability: AiCapability): boolean {
    return this.configured && this.capabilities.has(capability);
  }

  async execute(request: AiExecutionRequest): Promise<AiProviderResult> {
    const response = await providerFetch(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
          ...this.extraHeaders(),
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: request.temperature ?? 0.1,
          ...(request.maxOutputTokens
            ? { max_tokens: request.maxOutputTokens }
            : {}),
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.outputSchemaName,
              strict: true,
              schema: request.outputJsonSchema,
            },
          },
          ...(this.providerPreferences()
            ? { provider: this.providerPreferences() }
            : {}),
        }),
      },
      this.config.timeoutMs,
      this.provider,
    );
    const body = readObject(await response.json());
    const choices = Array.isArray(body?.choices) ? body.choices : [];
    const choice = readObject(choices[0]);
    const message = readObject(choice?.message);
    if (typeof message?.content !== 'string') {
      throw new ExternalProviderException(
        'The AI provider returned no usable content',
        `${this.provider}_INVALID_RESPONSE`,
      );
    }
    const usage = readObject(body?.usage);
    return {
      output: parseJsonText(message.content, this.provider),
      model: typeof body?.model === 'string' ? body.model : request.model,
      usage: {
        ...(typeof usage?.prompt_tokens === 'number'
          ? { inputTokens: usage.prompt_tokens }
          : {}),
        ...(typeof usage?.completion_tokens === 'number'
          ? { outputTokens: usage.completion_tokens }
          : {}),
        ...(typeof usage?.total_tokens === 'number'
          ? { totalTokens: usage.total_tokens }
          : {}),
      },
      ...(typeof body?.id === 'string' ? { providerRequestId: body.id } : {}),
    };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const started = Date.now();
    if (!this.configured) {
      return {
        provider: this.provider,
        state: ProviderState.NOT_CONFIGURED,
        checkedAt: new Date(),
        latencyMs: 0,
      };
    }
    try {
      await providerFetch(
        `${this.config.baseUrl}/models`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            ...this.extraHeaders(),
          },
        },
        this.config.timeoutMs,
        this.provider,
      );
      return {
        provider: this.provider,
        state: ProviderState.OPERATIONAL,
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        provider: this.provider,
        state: this.stateFromError(error),
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
        ...(error instanceof ExternalProviderException
          ? { safeCode: error.code }
          : {}),
      };
    }
  }

  private stateFromError(error: unknown): ProviderState {
    if (!(error instanceof ExternalProviderException))
      return ProviderState.UNAVAILABLE;
    if (error.code.endsWith(ProviderState.AUTHENTICATION_FAILED))
      return ProviderState.AUTHENTICATION_FAILED;
    if (error.code.endsWith(ProviderState.RATE_LIMITED))
      return ProviderState.RATE_LIMITED;
    if (error.code.endsWith(ProviderState.TIMEOUT))
      return ProviderState.TIMEOUT;
    return ProviderState.UNAVAILABLE;
  }
}
