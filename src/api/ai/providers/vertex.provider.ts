import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { ExternalProviderException } from '../../../core/exceptions';
import type { AiConfig, VertexAiConfig } from '../../../shared/config';
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
import { geminiThinkingConfig } from './gemini-thinking';

@Injectable()
export class VertexProvider implements AiProvider {
  readonly provider = AiProviderName.VERTEX;
  readonly configured: boolean;
  private readonly config: VertexAiConfig;
  private readonly auth: GoogleAuth;
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
    AiCapability.DAILY_CHALLENGE_GENERATION,
    AiCapability.IMAGE_UNDERSTANDING,
    AiCapability.OCR_FALLBACK,
    AiCapability.VIDEO_UNDERSTANDING,
  ]);

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AiConfig>('ai').vertex;
    const credentials = this.parseCredentials(this.config.credentialsJson);
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...(credentials ? { credentials } : {}),
    });
    this.configured = Boolean(
      this.config.enabled &&
      this.config.projectId &&
      this.config.location &&
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
    else if (
      [AiCapability.IMAGE_UNDERSTANDING, AiCapability.OCR_FALLBACK].includes(
        capability,
      )
    )
      key = 'vision';
    else if (capability === AiCapability.VIDEO_UNDERSTANDING) key = 'video';
    const model =
      key === 'vision' || key === 'video'
        ? this.config.models[key]
        : this.config.models[key] || this.config.models.text;
    return this.supports(capability) && model ? model : null;
  }

  async execute(request: AiExecutionRequest): Promise<AiProviderResult> {
    const token = await this.accessToken();
    const apiHost =
      this.config.location === 'global'
        ? 'aiplatform.googleapis.com'
        : `${encodeURIComponent(this.config.location)}-aiplatform.googleapis.com`;
    const thinkingConfig = geminiThinkingConfig(
      request.model,
      request.reasoningEffort,
    );
    const endpoint = `https://${apiHost}/v1/projects/${encodeURIComponent(this.config.projectId)}/locations/${encodeURIComponent(this.config.location)}/publishers/google/models/${encodeURIComponent(request.model)}:generateContent`;
    const response = await providerFetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
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
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: 'application/json',
            // Vertex structured output supports only a documented schema
            // subset, and complex length/count constraints can make an
            // otherwise valid request fail with INVALID_ARGUMENT. The full
            // domain contract is still enforced by the router's Joi validator
            // before any result is persisted.
            responseSchema: vertexOutputSchema(request.outputJsonSchema),
            ...(thinkingConfig ? { thinkingConfig } : {}),
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
    const usage = readObject(body?.usageMetadata);
    const finishReason =
      typeof candidate?.finishReason === 'string'
        ? candidate.finishReason
        : null;
    const finishMessage = safeVertexDiagnostic(candidate?.finishMessage);
    const promptFeedback = readObject(body?.promptFeedback);
    const blockReason =
      typeof promptFeedback?.blockReason === 'string'
        ? promptFeedback.blockReason
        : null;
    const blockReasonMessage = safeVertexDiagnostic(
      promptFeedback?.blockReasonMessage,
    );
    const responseId = safeVertexIdentifier(body?.responseId);
    const modelVersion = safeVertexIdentifier(body?.modelVersion);
    const parsedParts = parts
      .map(readObject)
      .filter((part): part is Record<string, unknown> => part !== null);
    const textParts = parsedParts.filter(
      (part) => part.thought !== true && typeof part.text === 'string',
    );
    // Gemini can split a structured response across multiple non-thinking
    // text parts. Join all of them, but never mistake hidden thought content
    // for the schema-constrained result.
    const text = textParts
      .map((part) => part.text as string)
      .join('')
      .trim();
    const providerRequestId = response.headers.get('x-goog-request-id');
    if (!text) {
      const safety = vertexSafetySummary(candidate, promptFeedback);
      const blocked =
        Boolean(blockReason) ||
        (finishReason
          ? VERTEX_BLOCKED_FINISH_REASONS.has(finishReason)
          : false);
      const operatorDetails = {
        finishReason,
        finishMessage,
        blockReason,
        blockReasonMessage,
        responseId,
        modelVersion,
        candidateCount: candidates.length,
        partCount: parsedParts.length,
        textPartCount: textParts.length,
        thoughtPartCount: parsedParts.filter((part) => part.thought === true)
          .length,
        inputTokens:
          typeof usage?.promptTokenCount === 'number'
            ? usage.promptTokenCount
            : null,
        outputTokens:
          typeof usage?.candidatesTokenCount === 'number'
            ? usage.candidatesTokenCount
            : null,
        reasoningTokens:
          typeof usage?.thoughtsTokenCount === 'number'
            ? usage.thoughtsTokenCount
            : null,
        totalTokens:
          typeof usage?.totalTokenCount === 'number'
            ? usage.totalTokenCount
            : null,
        mediaMimeType: request.media?.mimeType ?? null,
        mediaBytes: request.media
          ? decodedBase64Bytes(request.media.base64Data)
          : null,
        ...safety,
        providerRequestId,
      };
      throw new ExternalProviderException(
        blocked
          ? 'Vertex AI blocked the submitted content'
          : 'Vertex AI returned no usable content',
        finishReason === 'MAX_TOKENS'
          ? 'VERTEX_OUTPUT_TRUNCATED'
          : blocked
            ? 'VERTEX_CONTENT_BLOCKED'
            : finishReason === 'STOP'
              ? 'VERTEX_EMPTY_RESPONSE'
              : 'VERTEX_INVALID_RESPONSE',
        undefined,
        null,
        operatorDetails,
      );
    }
    return {
      output: parseJsonText(text, this.provider, {
        ...(finishReason === 'MAX_TOKENS'
          ? { invalidCode: 'VERTEX_OUTPUT_TRUNCATED' }
          : {}),
        operatorDetails: {
          finishReason,
          inputTokens:
            typeof usage?.promptTokenCount === 'number'
              ? usage.promptTokenCount
              : null,
          outputTokens:
            typeof usage?.candidatesTokenCount === 'number'
              ? usage.candidatesTokenCount
              : null,
          reasoningTokens:
            typeof usage?.thoughtsTokenCount === 'number'
              ? usage.thoughtsTokenCount
              : null,
          totalTokens:
            typeof usage?.totalTokenCount === 'number'
              ? usage.totalTokenCount
              : null,
          providerRequestId,
        },
      }),
      model: request.model,
      usage: {
        ...(typeof usage?.promptTokenCount === 'number'
          ? { inputTokens: usage.promptTokenCount }
          : {}),
        ...(typeof usage?.candidatesTokenCount === 'number'
          ? { outputTokens: usage.candidatesTokenCount }
          : {}),
        ...(typeof usage?.thoughtsTokenCount === 'number'
          ? { reasoningTokens: usage.thoughtsTokenCount }
          : {}),
        ...(typeof usage?.totalTokenCount === 'number'
          ? { totalTokens: usage.totalTokenCount }
          : {}),
      },
      ...(providerRequestId ? { providerRequestId } : {}),
    };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const started = Date.now();
    if (!this.configured)
      return {
        provider: this.provider,
        state: ProviderState.NOT_CONFIGURED,
        checkedAt: new Date(),
        latencyMs: 0,
      };
    try {
      await this.accessToken();
      return {
        provider: this.provider,
        state: ProviderState.CONFIGURED,
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
        safeCode: 'VERTEX_AUTHENTICATION_VALIDATED_MODEL_ON_FIRST_INFERENCE',
      };
    } catch (error) {
      return {
        provider: this.provider,
        state: ProviderState.AUTHENTICATION_FAILED,
        checkedAt: new Date(),
        latencyMs: Date.now() - started,
        safeCode:
          error instanceof ExternalProviderException
            ? error.code
            : 'VERTEX_AUTHENTICATION_FAILED',
      };
    }
  }

  private async accessToken(): Promise<string> {
    try {
      const client = await this.auth.getClient();
      const response = await client.getAccessToken();
      const token =
        typeof response === 'string'
          ? response
          : typeof response?.token === 'string'
            ? response.token
            : null;
      if (!token) throw new Error('No access token');
      return token;
    } catch {
      throw new ExternalProviderException(
        'Vertex AI authentication failed',
        'VERTEX_AUTHENTICATION_FAILED',
      );
    }
  }

  private parseCredentials(value: string): Record<string, string> | undefined {
    if (!value.trim()) return undefined;
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, string>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}

const VERTEX_SCHEMA_KEYS = new Set([
  'anyOf',
  'description',
  'enum',
  'format',
  'items',
  'nullable',
  'properties',
  'propertyOrdering',
  'required',
  'type',
]);

const VERTEX_BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'MODEL_ARMOR',
]);

function safeVertexIdentifier(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().slice(0, 160) : null;
}

function safeVertexDiagnostic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value
    .replace(/key=[^\s&]+/gi, 'key=[REDACTED]')
    .replace(/AIza[\w-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function vertexSafetySummary(
  candidate: Record<string, unknown> | null,
  promptFeedback: Record<string, unknown> | null,
): {
  safetyRatingCount: number;
  blockedSafetyRatingCount: number;
  safetyCategories: string | null;
} {
  const ratings: Record<string, unknown>[] = [];
  for (const source of [
    candidate?.safetyRatings,
    promptFeedback?.safetyRatings,
  ]) {
    if (!Array.isArray(source)) continue;
    for (const item of source as unknown[]) {
      const rating = readObject(item);
      if (rating) ratings.push(rating);
    }
  }
  const categories = [
    ...new Set(
      ratings.flatMap((rating) =>
        typeof rating.category === 'string'
          ? [rating.category.slice(0, 80)]
          : [],
      ),
    ),
  ].slice(0, 12);
  return {
    safetyRatingCount: ratings.length,
    blockedSafetyRatingCount: ratings.filter(
      (rating) => rating.blocked === true,
    ).length,
    safetyCategories: categories.length ? categories.join(',') : null,
  };
}

/**
 * Converts Verith's complete validation schema to Vertex's documented
 * structured-output subset. In particular, output-size limits belong in Joi:
 * sending many maxItems/maxLength constraints increases Vertex schema
 * complexity and can produce a provider-side 400 before generation.
 */
export function vertexOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(vertexOutputSchema);
  if (typeof value !== 'object' || value === null) return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (!VERTEX_SCHEMA_KEYS.has(key)) continue;
    if (key === 'properties' && typeof nested === 'object' && nested !== null) {
      result.properties = Object.fromEntries(
        Object.entries(nested as Record<string, unknown>).map(
          ([property, schema]) => [property, vertexOutputSchema(schema)],
        ),
      );
      continue;
    }
    result[key] = vertexOutputSchema(nested);
  }
  return result;
}
