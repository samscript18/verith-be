import { registerAs } from '@nestjs/config';

export type SearchProviderKey = 'GDELT' | 'WIKIPEDIA';

export interface SearchConfig {
  providerOrder: SearchProviderKey[];
  timeoutMs: number;
  maxRetries: number;
  maxEvidencePerClaim: number;
  healthCacheSeconds: number;
  gdeltBaseUrl: string;
  wikipediaBaseUrl: string;
}

export default registerAs('search', (): SearchConfig => ({
  providerOrder: ['GDELT', 'WIKIPEDIA'],
  timeoutMs: 20000,
  maxRetries: 2,
  maxEvidencePerClaim: 10,
  healthCacheSeconds: 300,
  gdeltBaseUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
  wikipediaBaseUrl: 'https://wikipedia.org/w/rest.php/v1',
}));
