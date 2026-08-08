import { registerAs } from '@nestjs/config';

export type SearchProviderKey = 'TAVILY' | 'WIKIPEDIA';

export interface SearchConfig {
  providerOrder: SearchProviderKey[];
  timeoutMs: number;
  maxRetries: number;
  maxEvidencePerClaim: number;
  healthCacheSeconds: number;
  tavilyApiKey?: string;
  tavilyApiKeys: string[];
  tavilyBaseUrl: string;
  wikipediaBaseUrl: string;
}

export default registerAs('search', (): SearchConfig => {
  const tavilyApiKeys = [
    ...new Set(
      (process.env.TAVILY_API_KEYS || process.env.TAVILY_API_KEY || '')
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
  const tavilyApiKey = tavilyApiKeys[0];
  return {
    providerOrder: ['TAVILY', 'WIKIPEDIA'],
    timeoutMs: 20000,
    maxRetries: 1,
    maxEvidencePerClaim: Number(process.env.MAX_EVIDENCE_PER_CLAIM ?? 4),
    healthCacheSeconds: 300,
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
    tavilyApiKeys,
    tavilyBaseUrl:
      process.env.TAVILY_BASE_URL?.trim() || 'https://api.tavily.com/search',
    wikipediaBaseUrl: 'https://wikipedia.org/w/rest.php/v1',
  };
});
