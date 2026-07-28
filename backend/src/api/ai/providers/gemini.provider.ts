import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalProviderException } from '../../../core/exceptions';
import type { AiConfig, AiProviderConfig } from '../../../shared/config';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type {
  AiExecutionRequest,
  AiProvider,
  AiProviderResult,
  ProviderHealthResult,
} from '../interfaces/ai-provider.interface';
import { parseJsonText, providerFetch, readObject } from './provider-http';

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly provider = AiProviderName.GEMINI;
  readonly configured: boolean;
  private readonly config: AiProviderConfig;
  private readonly capabilities = new Set([
    AiCapability.TEXT_REASONING,
    AiCapability.STRUCTURED_EXTRACTION,
    AiCapability.IMAGE_UNDERSTANDING,
    AiCapability.OCR_FALLBACK,
    AiCapability.AUDIO_REASONING,
    AiCapability.TRANSLATION,
  ]);

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AiConfig>('ai').gemini;
    this.configured = Boolean(
      this.config.apiKey && Object.values(this.config.models).some(Boolean),
    );
  }

  supports(capability: AiCapability): boolean {
    return this.configured && this.capabilities.has(capability);
  }

  modelFor(capability: AiCapability): string | null {
    const key = [
      AiCapability.IMAGE_UNDERSTANDING,
      AiCapability.OCR_FALLBACK,
      AiCapability.AUDIO_REASONING,
    ].includes(capability)
      ? 'vision'
      : 'text';
    return this.supports(capability) && this.config.models[key]
      ? this.config.models[key]
      : null;
  }

  async execute(request: AiExecutionRequest): Promise<AiProviderResult> {
    const response = await providerFetch(
      `${this.config.baseUrl}/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                ...(request.media
                  ? [
                      {
                        inlineData: {
                          mimeType: request.media.mimeType,
                          data: request.media.base64Data,
                        },
                      },
                    ]
                  : []),
                { text: request.userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? 0.1,
            ...(request.maxOutputTokens
              ? { maxOutputTokens: request.maxOutputTokens }
              : {}),
            responseMimeType: 'application/json',
            responseJsonSchema: request.outputJsonSchema,
          },
        }),
      },
      this.config.timeoutMs,
      this.provider,
    );
    const body = readObject(await response.json());
    const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
    const candidate = readObject(candidates[0]);
    const content = readObject(candidate?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const firstPart = readObject(parts[0]);
    if (typeof firstPart?.text !== 'string') {
      throw new ExternalProviderException(
        'Gemini returned no usable content',
        'GEMINI_INVALID_RESPONSE',
      );
    }
    const usage = readObject(body?.usageMetadata);
    return {
      output: parseJsonText(firstPart.text, this.provider),
      model: request.model,
      usage: {
        ...(typeof usage?.promptTokenCount === 'number'
          ? { inputTokens: usage.promptTokenCount }
          : {}),
        ...(typeof usage?.candidatesTokenCount === 'number'
          ? { outputTokens: usage.candidatesTokenCount }
          : {}),
        ...(typeof usage?.totalTokenCount === 'number'
          ? { totalTokens: usage.totalTokenCount }
          : {}),
      },
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
        `${this.config.baseUrl}/v1beta/models?key=${encodeURIComponent(this.config.apiKey)}`,
        { method: 'GET' },
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
      const code =
        error instanceof ExternalProviderException ? error.code : undefined;
      return {
        provider: this.provider,
        state: code?.endsWith(ProviderState.AUTHENTICATION_FAILED)
          ? ProviderState.AUTHENTICATION_FAILED
          : code?.endsWith(ProviderState.RATE_LIMITED)
            ? ProviderState.RATE_LIMITED
            : code?.endsWith(ProviderState.TIMEOUT)
              ? ProviderState.TIMEOUT
              : ProviderState.UNAVAILABLE,
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
        ...(code ? { safeCode: code } : {}),
      };
    }
  }
}
