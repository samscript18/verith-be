import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import sanitizeHtml from 'sanitize-html';
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

interface WikipediaPage {
  id?: unknown;
  key?: unknown;
  title?: unknown;
  excerpt?: unknown;
  description?: unknown;
}

interface WikipediaResponse {
  pages?: unknown;
}

@Injectable()
export class WikipediaProvider implements SearchProvider {
  readonly provider = SearchProviderName.WIKIPEDIA;
  readonly configured = true;
  private readonly config: SearchConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<SearchConfig>('search');
  }

  async search(request: SearchRequest): Promise<SearchResultPage> {
    const language = this.language(request.language);
    const baseUrl = this.config.wikipediaBaseUrl.replace(
      '://wikipedia.org',
      `://${language}.wikipedia.org`,
    );
    const params = new URLSearchParams({
      q: request.query,
      limit: String(Math.min(Math.max(request.limit, 1), 100)),
    });

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/search/page?${params}`, {
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

    let payload: WikipediaResponse;
    try {
      payload = (await response.json()) as WikipediaResponse;
    } catch {
      throw new ExternalProviderException(
        'Wikipedia returned an invalid response',
        'SEARCH_PROVIDER_INVALID_RESPONSE',
      );
    }
    if (!Array.isArray(payload.pages)) {
      throw new ExternalProviderException(
        'Wikipedia returned an invalid response',
        'SEARCH_PROVIDER_INVALID_RESPONSE',
      );
    }

    const pages = payload.pages as WikipediaPage[];
    const results = pages.flatMap((page, index) => {
      if (typeof page.key !== 'string' || typeof page.title !== 'string')
        return [];
      const rawSnippet =
        typeof page.excerpt === 'string'
          ? page.excerpt
          : typeof page.description === 'string'
            ? page.description
            : page.title;
      return [
        {
          title: page.title,
          url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
          snippet: sanitizeHtml(rawSnippet, {
            allowedTags: [],
            allowedAttributes: {},
          }),
          providerScore: this.rankScore(index, pages.length),
        },
      ];
    });
    return { provider: this.provider, results };
  }

  async healthCheck(): Promise<SearchProviderHealth> {
    const startedAt = performance.now();
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
        state: code.endsWith('RATE_LIMITED')
          ? ProviderState.RATE_LIMITED
          : code.endsWith('TIMEOUT')
            ? ProviderState.TIMEOUT
            : ProviderState.UNAVAILABLE,
        checkedAt: new Date(),
        latencyMs: Math.round(performance.now() - startedAt),
        safeCode: code,
      };
    }
  }

  private language(value?: string): string {
    const normalized = value?.toLowerCase().split(/[-_]/)[0];
    return normalized && /^[a-z]{2,3}$/.test(normalized) ? normalized : 'en';
  }

  private rankScore(index: number, total: number): number {
    return total > 0 ? Number(((total - index) / total).toFixed(4)) : 0;
  }

  private networkFailure(error: unknown): ExternalProviderException {
    return new ExternalProviderException(
      'Wikipedia is unavailable',
      error instanceof Error && error.name === 'TimeoutError'
        ? 'SEARCH_PROVIDER_TIMEOUT'
        : 'SEARCH_PROVIDER_UNAVAILABLE',
    );
  }

  private httpFailure(status: number): ExternalProviderException {
    return new ExternalProviderException(
      'Wikipedia rejected the request',
      status === 429
        ? 'SEARCH_PROVIDER_RATE_LIMITED'
        : 'SEARCH_PROVIDER_UNAVAILABLE',
    );
  }
}
