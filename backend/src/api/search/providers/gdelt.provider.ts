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

interface GdeltArticle {
  url?: unknown;
  title?: unknown;
}

interface GdeltResponse {
  articles?: unknown;
}

@Injectable()
export class GdeltProvider implements SearchProvider {
  readonly provider = SearchProviderName.GDELT;
  readonly configured = true;
  private readonly config: SearchConfig;
  private cooldownUntil = 0;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<SearchConfig>('search');
  }

  async search(request: SearchRequest): Promise<SearchResultPage> {
    if (this.cooldownUntil > Date.now()) {
      throw new ExternalProviderException(
        'GDELT is temporarily rate limited',
        'SEARCH_PROVIDER_RATE_LIMITED',
      );
    }
    const query = this.buildQuery(request);
    const params = new URLSearchParams({
      query,
      mode: 'artlist',
      format: 'json',
      maxrecords: String(Math.min(Math.max(request.limit, 1), 250)),
      sort: 'hybridrel',
    });
    this.applyDateRange(params, request);

    let response: Response;
    try {
      response = await fetch(`${this.config.gdeltBaseUrl}?${params}`, {
        headers: {
          accept: 'application/json',
          'user-agent': 'VerithBot/1.0 (+https://verith.example/bot)',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw this.networkFailure(error);
    }
    if (!response.ok) throw this.httpFailure(response.status);

    let payload: GdeltResponse;
    try {
      payload = (await response.json()) as GdeltResponse;
    } catch {
      throw new ExternalProviderException(
        'GDELT returned an invalid response',
        'SEARCH_PROVIDER_INVALID_RESPONSE',
      );
    }
    if (!Array.isArray(payload.articles)) {
      throw new ExternalProviderException(
        'GDELT returned an invalid response',
        'SEARCH_PROVIDER_INVALID_RESPONSE',
      );
    }

    const articles = payload.articles as GdeltArticle[];
    const results = articles.flatMap((article, index) => {
      if (
        typeof article.url !== 'string' ||
        typeof article.title !== 'string'
      ) {
        return [];
      }
      return [
        {
          title: article.title,
          url: article.url,
          // GDELT exposes the source article for retrieval but not a search
          // excerpt. The title is kept as the bounded pre-retrieval snippet.
          snippet: article.title,
          providerScore: this.rankScore(index, articles.length),
        },
      ];
    });
    return { provider: this.provider, results };
  }

  async healthCheck(): Promise<SearchProviderHealth> {
    return this.checkHealth(() =>
      this.search({ query: 'verification', limit: 1, safeSearch: true }),
    );
  }

  private buildQuery(request: SearchRequest): string {
    const clauses = [request.query.trim()];
    if (request.includeDomains?.length) {
      clauses.push(
        `(${request.includeDomains.map((domain) => `domainis:${domain}`).join(' OR ')})`,
      );
    }
    for (const domain of request.excludeDomains ?? []) {
      clauses.push(`-domainis:${domain}`);
    }
    return clauses.join(' ');
  }

  private applyDateRange(
    params: URLSearchParams,
    request: SearchRequest,
  ): void {
    if (request.startDate)
      params.set('startdatetime', this.gdeltDate(request.startDate, false));
    if (request.endDate)
      params.set('enddatetime', this.gdeltDate(request.endDate, true));
    if (request.startDate || request.endDate) return;
    const timespan = {
      day: '1d',
      week: '1week',
      month: '1month',
      year: '3months',
    }[request.recency ?? 'month'];
    params.set('timespan', timespan);
  }

  private gdeltDate(value: string, endOfDay: boolean): string {
    return `${value.replaceAll('-', '')}${endOfDay ? '235959' : '000000'}`;
  }

  private rankScore(index: number, total: number): number {
    return total > 0 ? Number(((total - index) / total).toFixed(4)) : 0;
  }

  private async checkHealth(
    check: () => Promise<unknown>,
  ): Promise<SearchProviderHealth> {
    const startedAt = performance.now();
    try {
      await check();
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

  private networkFailure(error: unknown): ExternalProviderException {
    return new ExternalProviderException(
      'GDELT is unavailable',
      error instanceof Error && error.name === 'TimeoutError'
        ? 'SEARCH_PROVIDER_TIMEOUT'
        : 'SEARCH_PROVIDER_UNAVAILABLE',
    );
  }

  private httpFailure(status: number): ExternalProviderException {
    if (status === 429) this.cooldownUntil = Date.now() + 5000;
    return new ExternalProviderException(
      'GDELT rejected the request',
      status === 429
        ? 'SEARCH_PROVIDER_RATE_LIMITED'
        : 'SEARCH_PROVIDER_UNAVAILABLE',
    );
  }

  private stateForCode(code: string): ProviderState {
    if (code.endsWith('RATE_LIMITED')) return ProviderState.RATE_LIMITED;
    if (code.endsWith('TIMEOUT')) return ProviderState.TIMEOUT;
    return ProviderState.UNAVAILABLE;
  }
}
