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

interface TavilyResponse {
  request_id?: unknown;
  results?: unknown;
  usage?: { credits?: unknown };
}

@Injectable()
export class TavilyProvider implements SearchProvider {
  readonly provider = SearchProviderName.TAVILY;
  readonly configured: boolean;
  private readonly config: SearchConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<SearchConfig>('search');
    this.configured = this.config.tavily.apiKey.trim().length > 0;
  }

  async search(request: SearchRequest): Promise<SearchResultPage> {
    if (!this.configured) {
      throw new ExternalProviderException(
        'Tavily is not configured',
        'SEARCH_PROVIDER_NOT_CONFIGURED',
      );
    }
    const body: Record<string, unknown> = {
      query: request.query,
      topic: 'general',
      search_depth: 'basic',
      max_results: Math.min(Math.max(request.limit, 1), 20),
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    };
    if (request.country) body.country = request.country;
    if (request.recency) body.time_range = request.recency;
    if (request.startDate) body.start_date = request.startDate;
    if (request.endDate) body.end_date = request.endDate;
    if (request.includeDomains?.length)
      body.include_domains = request.includeDomains;
    if (request.excludeDomains?.length)
      body.exclude_domains = request.excludeDomains;

    let response: Response;
    try {
      response = await fetch(
        `${this.config.tavily.baseUrl.replace(/\/+$/, '')}/search`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.tavily.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );
    } catch (error) {
      throw new ExternalProviderException(
        'The search provider request failed',
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'SEARCH_PROVIDER_TIMEOUT'
          : 'SEARCH_PROVIDER_UNAVAILABLE',
      );
    }
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? 'SEARCH_PROVIDER_AUTHENTICATION_FAILED'
          : response.status === 429
            ? 'SEARCH_PROVIDER_RATE_LIMITED'
            : 'SEARCH_PROVIDER_UNAVAILABLE';
      throw new ExternalProviderException(
        'The search provider rejected the request',
        code,
      );
    }
    let payload: TavilyResponse;
    try {
      payload = (await response.json()) as TavilyResponse;
    } catch {
      throw new ExternalProviderException(
        'The search provider returned an invalid response',
        'SEARCH_PROVIDER_INVALID_RESPONSE',
      );
    }
    if (!Array.isArray(payload.results)) {
      throw new ExternalProviderException(
        'The search provider returned an invalid response',
        'SEARCH_PROVIDER_INVALID_RESPONSE',
      );
    }
    const results = payload.results.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      if (
        typeof value.title !== 'string' ||
        typeof value.url !== 'string' ||
        typeof value.content !== 'string'
      )
        return [];
      return [
        {
          title: value.title,
          url: value.url,
          snippet: value.content,
          providerScore: typeof value.score === 'number' ? value.score : 0,
        },
      ];
    });
    return {
      provider: this.provider,
      results,
      ...(typeof payload.request_id === 'string'
        ? { requestId: payload.request_id }
        : {}),
      ...(typeof payload.usage?.credits === 'number'
        ? { creditsUsed: payload.usage.credits }
        : {}),
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
      await this.search({
        query: 'site:example.com',
        limit: 1,
        safeSearch: true,
      });
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

  private stateForCode(code: string): ProviderState {
    if (code.endsWith('AUTHENTICATION_FAILED'))
      return ProviderState.AUTHENTICATION_FAILED;
    if (code.endsWith('RATE_LIMITED')) return ProviderState.RATE_LIMITED;
    if (code.endsWith('TIMEOUT')) return ProviderState.TIMEOUT;
    return ProviderState.UNAVAILABLE;
  }
}
