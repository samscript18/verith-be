import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import { ExternalProviderException } from '../../../core/exceptions';
import type { SearchConfig } from '../../../shared/config';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { ProviderKeyPoolService } from '../../../shared/providers/provider-key-pool.service';
import { SearchProviderName } from '../enums/search-provider-name.enum';
import type {
  SearchProvider,
  SearchProviderHealth,
  SearchRequest,
  SearchResultPage,
} from '../interfaces/search-provider.interface';

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
  raw_content?: unknown;
}

interface TavilyResponse {
  request_id?: unknown;
  results?: unknown;
}

@Injectable()
export class TavilyProvider implements SearchProvider {
  readonly provider = SearchProviderName.TAVILY;
  readonly configured: boolean;
  private readonly config: SearchConfig;
  private readonly keyPool;

  constructor(
    configService: ConfigService,
    pools: ProviderKeyPoolService = new ProviderKeyPoolService(),
  ) {
    this.config = configService.getOrThrow<SearchConfig>('search');
    this.keyPool = pools.forProvider(
      this.provider,
      this.config.tavilyApiKeys?.length
        ? this.config.tavilyApiKeys
        : [this.config.tavilyApiKey ?? ''],
    );
    this.configured = this.keyPool.status().configuredKeys > 0;
  }

  async search(request: SearchRequest): Promise<SearchResultPage> {
    if (!this.configured) {
      throw new ExternalProviderException(
        'Tavily is not configured',
        'SEARCH_PROVIDER_NOT_CONFIGURED',
      );
    }
    const lease = this.keyPool.acquire();
    if (!lease) {
      throw new ExternalProviderException(
        'Tavily is temporarily rate limited',
        'SEARCH_PROVIDER_RATE_LIMITED',
      );
    }

    const body: Record<string, unknown> = {
      query: request.query.trim(),
      search_depth: 'basic',
      topic: 'general',
      max_results: Math.min(Math.max(request.limit, 1), 20),
      include_answer: false,
      // Tavily extraction is a fallback when the hardened direct fetch cannot
      // open a public source. Search snippets remain metadata, never evidence.
      include_raw_content: 'text',
    };
    if (request.includeDomains?.length)
      body.include_domains = request.includeDomains;
    if (request.excludeDomains?.length)
      body.exclude_domains = request.excludeDomains;
    if (request.startDate) body.start_date = request.startDate;
    if (request.endDate) body.end_date = request.endDate;
    if (!request.startDate && !request.endDate && request.recency)
      body.time_range = request.recency;

    let response: Response;
    try {
      response = await fetch(this.config.tavilyBaseUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${lease.key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok) {
        const failure = this.httpFailure(response);
        lease.fail(
          failure.code,
          this.retryAfterMs(response.headers.get('retry-after')),
        );
        throw failure;
      }
      lease.succeed();
    } catch (error) {
      if (error instanceof ExternalProviderException) throw error;
      lease.fail(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'SEARCH_PROVIDER_TIMEOUT'
          : 'SEARCH_PROVIDER_UNAVAILABLE',
      );
      throw this.networkFailure(error);
    }

    let payload: TavilyResponse;
    try {
      payload = (await response.json()) as TavilyResponse;
    } catch {
      throw this.invalidResponse();
    }
    if (!Array.isArray(payload.results)) throw this.invalidResponse();

    const sourceResults = payload.results as TavilyResult[];
    const results = sourceResults.flatMap((result, index) => {
      if (typeof result.title !== 'string' || typeof result.url !== 'string')
        return [];
      const score =
        typeof result.score === 'number' && Number.isFinite(result.score)
          ? Math.min(Math.max(result.score, 0), 1)
          : this.rankScore(index, sourceResults.length);
      return [
        {
          title: result.title,
          url: result.url,
          snippet:
            typeof result.content === 'string' && result.content.trim()
              ? result.content.trim()
              : result.title,
          ...(typeof result.raw_content === 'string' &&
          result.raw_content.trim().length >= 100
            ? { rawContent: result.raw_content.trim() }
            : {}),
          providerScore: Number(score.toFixed(4)),
        },
      ];
    });

    return {
      provider: this.provider,
      ...(typeof payload.request_id === 'string'
        ? { requestId: payload.request_id }
        : {}),
      results,
    };
  }

  async healthCheck(): Promise<SearchProviderHealth> {
    const startedAt = performance.now();
    if (!this.configured) {
      return {
        provider: this.provider,
        state: ProviderState.NOT_CONFIGURED,
        checkedAt: new Date(),
        latencyMs: 0,
        safeCode: 'SEARCH_PROVIDER_NOT_CONFIGURED',
        ...this.keyPool.status(),
      };
    }
    try {
      await this.search({ query: 'verification', limit: 1, safeSearch: true });
      return {
        provider: this.provider,
        state: ProviderState.OPERATIONAL,
        checkedAt: new Date(),
        latencyMs: Math.round(performance.now() - startedAt),
        ...this.keyPool.status(),
      };
    } catch (error) {
      const code =
        error instanceof ExternalProviderException
          ? error.code
          : 'SEARCH_PROVIDER_UNAVAILABLE';
      return {
        provider: this.provider,
        state: this.stateForCode(code),
        checkedAt: new Date(),
        latencyMs: Math.round(performance.now() - startedAt),
        safeCode: code,
        ...this.keyPool.status(),
      };
    }
  }

  private invalidResponse(): ExternalProviderException {
    return new ExternalProviderException(
      'Tavily returned an invalid response',
      'SEARCH_PROVIDER_INVALID_RESPONSE',
    );
  }

  private networkFailure(error: unknown): ExternalProviderException {
    return new ExternalProviderException(
      'Tavily is unavailable',
      error instanceof Error && error.name === 'TimeoutError'
        ? 'SEARCH_PROVIDER_TIMEOUT'
        : 'SEARCH_PROVIDER_UNAVAILABLE',
    );
  }

  private httpFailure(response: Response): ExternalProviderException {
    const code =
      response.status === 429
        ? 'SEARCH_PROVIDER_RATE_LIMITED'
        : response.status === 401 || response.status === 403
          ? 'SEARCH_PROVIDER_AUTHENTICATION_FAILED'
          : 'SEARCH_PROVIDER_UNAVAILABLE';
    return new ExternalProviderException('Tavily rejected the request', code);
  }

  private retryAfterMs(value: string | null): number | undefined {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
  }

  private rankScore(index: number, total: number): number {
    return total > 0 ? Number(((total - index) / total).toFixed(4)) : 0;
  }

  private stateForCode(code: string): ProviderState {
    if (code.endsWith('RATE_LIMITED')) return ProviderState.RATE_LIMITED;
    if (code.endsWith('AUTHENTICATION_FAILED'))
      return ProviderState.AUTHENTICATION_FAILED;
    if (code.endsWith('TIMEOUT')) return ProviderState.TIMEOUT;
    return ProviderState.UNAVAILABLE;
  }
}
