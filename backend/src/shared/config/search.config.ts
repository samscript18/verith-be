import { registerAs } from '@nestjs/config';

export interface SearchConfig {
  primaryProvider: string;
  fallbackProvider: string;
  timeoutMs: number;
  maxRetries: number;
  maxEvidencePerClaim: number;
  healthCacheSeconds: number;
  tavily: { apiKey: string; baseUrl: string };
}

export default registerAs('search', (): SearchConfig => ({
  primaryProvider: process.env.SEARCH_PRIMARY_PROVIDER ?? 'tavily',
  fallbackProvider: process.env.SEARCH_FALLBACK_PROVIDER ?? '',
  timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS ?? 20000),
  maxRetries: Number(process.env.SEARCH_MAX_RETRIES ?? 2),
  maxEvidencePerClaim: Number(
    process.env.VERIFICATION_MAX_EVIDENCE_PER_CLAIM ?? 10,
  ),
  healthCacheSeconds: Number(process.env.PROVIDER_HEALTH_CACHE_SECONDS ?? 300),
  tavily: {
    apiKey: process.env.TAVILY_API_KEY ?? '',
    baseUrl: process.env.TAVILY_BASE_URL ?? 'https://api.tavily.com',
  },
}));
