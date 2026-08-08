import type { ProviderState } from '../../../shared/enums/provider-state.enum';
import type { SearchProviderName } from '../enums/search-provider-name.enum';

export interface SearchRequest {
  query: string;
  language?: string;
  country?: string;
  recency?: 'day' | 'week' | 'month' | 'year';
  startDate?: string;
  endDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  limit: number;
  safeSearch: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Cleaned page content returned by the search provider, never a snippet. */
  rawContent?: string;
  providerScore: number;
}

export interface SearchResultPage {
  provider: SearchProviderName;
  requestId?: string;
  results: SearchResult[];
  creditsUsed?: number;
}

export interface SearchProviderHealth {
  provider: SearchProviderName;
  state: ProviderState;
  checkedAt: Date;
  latencyMs: number;
  safeCode?: string;
  configuredKeys?: number;
  healthyKeys?: number;
  cooldownKeys?: number;
  disabledKeys?: number;
  nextAvailableAt?: Date;
}

export interface SearchProvider {
  readonly provider: SearchProviderName;
  readonly configured: boolean;
  search(request: SearchRequest): Promise<SearchResultPage>;
  healthCheck(): Promise<SearchProviderHealth>;
}

export const SEARCH_PROVIDERS = Symbol('SEARCH_PROVIDERS');
