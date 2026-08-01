import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import { ExternalProviderException } from '../../../core/exceptions';
import type { SearchConfig } from '../../../shared/config';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
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
  private cooldownUntil = 0;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<SearchConfig>('search');
    this.configured = Boolean(this.config.tavilyApiKey);
  }

  async search(request: SearchRequest): Promise<SearchResultPage> {
    if (!this.config.tavilyApiKey) {
      throw new ExternalProviderException(
        'Tavily is not configured',
        'SEARCH_PROVIDER_NOT_CONFIGURED',
      );
    }
    if (this.cooldownUntil > Date.now()) {
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
      include_raw_content: false,
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
          authorization: `Bearer ${this.config.tavilyApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw this.networkFailure(error);
    }
    if (!response.ok) throw this.httpFailure(response);

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
      };
    }
    try {
      await this.search({ query: 'verification', limit: 1, safeSearch: true });
      return {
        provider: this.provider,
        state: ProviderState.OPERATIONAL,
        checkedAt: new Date(),
        latencyMs: Math.round(performance.now() - startedAt),
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
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      this.cooldownUntil =
        Date.now() +
        (Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 60_000);
    }
    const code =
      response.status === 429
        ? 'SEARCH_PROVIDER_RATE_LIMITED'
        : response.status === 401 || response.status === 403
          ? 'SEARCH_PROVIDER_AUTHENTICATION_FAILED'
          : 'SEARCH_PROVIDER_UNAVAILABLE';
    return new ExternalProviderException('Tavily rejected the request', code);
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
