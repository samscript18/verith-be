import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalProviderException } from '../../../core/exceptions';
import type { AiConfig } from '../../../shared/config';
import { ProviderKeyPoolService } from '../../../shared/providers/provider-key-pool.service';

interface GroqSegment {
  start?: unknown;
  end?: unknown;
  text?: unknown;
  avg_logprob?: unknown;
}

@Injectable()
export class GroqTranscriptionService {
  private readonly config: AiConfig['groq'];
  private readonly keyPool;
  constructor(
    configService: ConfigService,
    pools: ProviderKeyPoolService = new ProviderKeyPoolService(),
  ) {
    this.config = configService.getOrThrow<AiConfig>('ai').groq;
    this.keyPool = pools.forProvider(
      'GROQ',
      this.config.apiKeys?.length ? this.config.apiKeys : [this.config.apiKey],
    );
  }

  async transcribe(url: string): Promise<{
    text: string;
    language: string;
    duration?: number;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      confidence?: number;
    }>;
  }> {
    const model = this.config.models.transcription;
    if (!this.keyPool.status().configuredKeys || !model)
      throw new ExternalProviderException(
        'Groq transcription is not configured',
        'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED',
      );
    const lease = this.keyPool.acquire();
    if (!lease)
      throw new ExternalProviderException(
        'Groq transcription is temporarily rate limited',
        'TRANSCRIPTION_RATE_LIMITED',
      );
    const form = new FormData();
    form.append('url', url);
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');
    let response: Response;
    try {
      response = await fetch(
        `${this.config.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${lease.key}` },
          body: form,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'TRANSCRIPTION_TIMEOUT'
          : 'TRANSCRIPTION_UNAVAILABLE';
      lease.fail(code);
      throw new ExternalProviderException(
        'The transcription provider is unavailable',
        code,
      );
    }
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? 'TRANSCRIPTION_AUTHENTICATION_FAILED'
          : response.status === 429
            ? 'TRANSCRIPTION_RATE_LIMITED'
            : 'TRANSCRIPTION_UNAVAILABLE';
      lease.fail(code);
      throw new ExternalProviderException(
        'The transcription provider rejected the request',
        code,
      );
    }
    lease.succeed();
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.text !== 'string')
      throw new ExternalProviderException(
        'The transcription response was invalid',
        'TRANSCRIPTION_INVALID_RESPONSE',
      );
    const rawSegments = Array.isArray(body.segments)
      ? (body.segments as GroqSegment[])
      : [];
    const segments = rawSegments.flatMap((item) => {
      if (
        typeof item.start !== 'number' ||
        typeof item.end !== 'number' ||
        typeof item.text !== 'string'
      )
        return [];
      const confidence =
        typeof item.avg_logprob === 'number'
          ? Math.min(1, Math.max(0, Math.exp(item.avg_logprob)))
          : undefined;
      return [
        {
          start: item.start,
          end: item.end,
          text: item.text,
          ...(confidence !== undefined ? { confidence } : {}),
        },
      ];
    });
    return {
      text: body.text,
      language: typeof body.language === 'string' ? body.language : 'unknown',
      ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
      segments,
    };
  }
}
