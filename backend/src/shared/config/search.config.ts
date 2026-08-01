import { registerAs } from '@nestjs/config';

export type SearchProviderKey = 'TAVILY' | 'WIKIPEDIA';

export interface SearchConfig {
  providerOrder: SearchProviderKey[];
  timeoutMs: number;
  maxRetries: number;
  maxEvidencePerClaim: number;
  healthCacheSeconds: number;
  tavilyApiKey?: string;
  tavilyBaseUrl: string;
  wikipediaBaseUrl: string;
}

export default registerAs('search', (): SearchConfig => {
  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
  return {
    providerOrder: ['TAVILY', 'WIKIPEDIA'],
    timeoutMs: 20000,
    maxRetries: 2,
    maxEvidencePerClaim: 10,
    healthCacheSeconds: 300,
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
    tavilyBaseUrl:
      process.env.TAVILY_BASE_URL?.trim() || 'https://api.tavily.com/search',
    wikipediaBaseUrl: 'https://wikipedia.org/w/rest.php/v1',
  };
});
