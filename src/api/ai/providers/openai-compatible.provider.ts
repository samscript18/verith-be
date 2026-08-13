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
import {
  isProviderKeyHealthFailure,
  isKeyRecoverableProviderFailure,
  ProviderKeyPoolService,
} from '../../../shared/providers/provider-key-pool.service';

export abstract class OpenAiCompatibleProvider implements AiProvider {
  abstract readonly provider: AiProviderName;
  abstract readonly capabilities: ReadonlySet<AiCapability>;
  abstract modelFor(capability: AiCapability): string | null;
  protected abstract extraHeaders(): Record<string, string>;
  protected providerPreferences(): Record<string, unknown> | undefined {
    return undefined;
  }
  protected requestPreferences(
    _request: AiExecutionRequest,
  ): Record<string, unknown> | undefined {
    void _request;
    return undefined;
  }

  readonly configured: boolean;
  private readonly keyPool;

  protected constructor(
    protected readonly config: AiProviderConfig,
    provider: AiProviderName,
    pools: ProviderKeyPoolService,
  ) {
    this.keyPool = pools.forProvider(
      provider,
      config.apiKeys?.length ? config.apiKeys : [config.apiKey],
    );
    this.configured = Boolean(
      this.keyPool.status().configuredKeys &&
      Object.values(config.models).some(Boolean),
    );
  }

  supports(capability: AiCapability): boolean {
    return this.configured && this.capabilities.has(capability);
  }

  async execute(request: AiExecutionRequest): Promise<AiProviderResult> {
    const keyCount = this.keyPool.status().configuredKeys;
    let lastError: ExternalProviderException | undefined;
    for (let keyAttempt = 0; keyAttempt < keyCount; keyAttempt += 1) {
      const lease = this.keyPool.acquire();
      if (!lease) break;
      try {
        const response = await providerFetch(
          `${this.config.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${lease.key}`,
              'content-type': 'application/json',
              ...this.extraHeaders(),
            },
            body: JSON.stringify({
              model: request.model,
              messages: [
                { role: 'system', content: request.systemPrompt },
                {
                  role: 'user',
                  content: request.media
                    ? [
                        {
                          type: 'image_url',
                          image_url: {
                            url: `data:${request.media.mimeType};base64,${request.media.base64Data}`,
                          },
                        },
                        { type: 'text', text: request.userPrompt },
                      ]
                    : request.userPrompt,
                },
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
              ...(this.requestPreferences(request) ?? {}),
            }),
          },
          this.config.timeoutMs,
          this.provider,
        );
        const body = readObject(await response.json());
        const choices = Array.isArray(body?.choices) ? body.choices : [];
        const choice = readObject(choices[0]);
        const message = readObject(choice?.message);
        const content = this.messageText(message?.content);
        if (!content) {
          const usage = readObject(body?.usage);
          throw new ExternalProviderException(
            'The AI provider returned no usable content',
            `${this.provider}_INVALID_RESPONSE`,
            undefined,
            null,
            {
              providerRequestId:
                typeof body?.id === 'string' ? body.id.slice(0, 160) : null,
              finishReason:
                typeof choice?.finish_reason === 'string'
                  ? choice.finish_reason.slice(0, 80)
                  : null,
              nativeFinishReason:
                typeof choice?.native_finish_reason === 'string'
                  ? choice.native_finish_reason.slice(0, 80)
                  : null,
              reasoningCharacters:
                typeof message?.reasoning === 'string'
                  ? message.reasoning.length
                  : 0,
              completionTokens:
                typeof usage?.completion_tokens === 'number'
                  ? usage.completion_tokens
                  : null,
            },
          );
        }
        const usage = readObject(body?.usage);
        const finishReason =
          typeof choice?.finish_reason === 'string'
            ? choice.finish_reason
            : null;
        const output = parseJsonText(content, this.provider, {
          ...(finishReason === 'length'
            ? { invalidCode: `${this.provider}_OUTPUT_TRUNCATED` }
            : {}),
          operatorDetails: {
            finishReason,
            nativeFinishReason:
              typeof choice?.native_finish_reason === 'string'
                ? choice.native_finish_reason
                : null,
            inputTokens:
              typeof usage?.prompt_tokens === 'number'
                ? usage.prompt_tokens
                : null,
            outputTokens:
              typeof usage?.completion_tokens === 'number'
                ? usage.completion_tokens
                : null,
            totalTokens:
              typeof usage?.total_tokens === 'number'
                ? usage.total_tokens
                : null,
            providerRequestId:
              typeof body?.id === 'string' ? body.id.slice(0, 160) : null,
          },
        });
        lease.succeed();
        return {
          output,
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
          ...(typeof body?.id === 'string'
            ? { providerRequestId: body.id }
            : {}),
        };
      } catch (error) {
        const failure =
          error instanceof ExternalProviderException
            ? error
            : new ExternalProviderException(
                'The AI provider is unavailable',
                `${this.provider}_${ProviderState.UNAVAILABLE}`,
              );
        if (isProviderKeyHealthFailure(failure.code)) lease.fail(failure.code);
        else lease.release();
        lastError = failure;
        if (!isKeyRecoverableProviderFailure(failure.code)) throw failure;
      }
    }
    throw (
      lastError ??
      new ExternalProviderException(
        'No healthy provider key is currently available',
        `${this.provider}_${ProviderState.RATE_LIMITED}`,
      )
    );
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const started = Date.now();
    if (!this.configured) {
      return {
        provider: this.provider,
        state: ProviderState.NOT_CONFIGURED,
        checkedAt: new Date(),
        latencyMs: 0,
        ...this.keyPool.status(),
      };
    }
    const lease = this.keyPool.acquire();
    if (!lease) {
      return {
        provider: this.provider,
        state: ProviderState.RATE_LIMITED,
        checkedAt: new Date(),
        latencyMs: 0,
        safeCode: `${this.provider}_${ProviderState.RATE_LIMITED}`,
        ...this.keyPool.status(),
      };
    }
    try {
      await providerFetch(
        `${this.config.baseUrl}/models`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${lease.key}`,
            ...this.extraHeaders(),
          },
        },
        this.config.timeoutMs,
        this.provider,
      );
      lease.succeed();
      return {
        provider: this.provider,
        state: ProviderState.OPERATIONAL,
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
        ...this.keyPool.status(),
      };
    } catch (error) {
      lease.fail(
        error instanceof ExternalProviderException
          ? error.code
          : `${this.provider}_${ProviderState.UNAVAILABLE}`,
      );
      return {
        provider: this.provider,
        state: this.stateFromError(error),
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
        ...(error instanceof ExternalProviderException
          ? { safeCode: error.code }
          : {}),
        ...this.keyPool.status(),
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

  private messageText(content: unknown): string | null {
    if (typeof content === 'string') return content.trim() || null;
    if (!Array.isArray(content)) return null;
    const text = content
      .flatMap((part) => {
        const item = readObject(part);
        return typeof item?.text === 'string' ? [item.text] : [];
      })
      .join('')
      .trim();
    return text || null;
  }
}
