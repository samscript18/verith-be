import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { ExternalProviderException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { SearchProviderName } from '../enums/search-provider-name.enum';
import type { SearchProvider } from '../interfaces/search-provider.interface';
import type { SearchExecution } from '../schemas/search-execution.schema';
import { SearchRouterService } from './search-router.service';

describe('SearchRouterService', () => {
  it('records a failed primary and returns the next free provider', async () => {
    const gdelt = provider(SearchProviderName.GDELT, () =>
      Promise.reject(
        new ExternalProviderException(
          'GDELT is unavailable',
          'SEARCH_PROVIDER_UNAVAILABLE',
        ),
      ),
    );
    const wikipedia = provider(SearchProviderName.WIKIPEDIA, () =>
      Promise.resolve({
        provider: SearchProviderName.WIKIPEDIA,
        results: [
          {
            title: 'Verification',
            url: 'https://en.wikipedia.org/wiki/Verification',
            snippet: 'Verification checks information.',
            providerScore: 1,
          },
        ],
      }),
    );
    const create = jest.fn().mockResolvedValue({});
    const router = new SearchRouterService(
      [gdelt, wikipedia],
      { create } as unknown as Model<SearchExecution>,
      new ConfigService({
        search: {
          providerOrder: ['GDELT', 'WIKIPEDIA'],
          timeoutMs: 20000,
          maxRetries: 0,
          maxEvidencePerClaim: 10,
          healthCacheSeconds: 300,
          gdeltBaseUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
          wikipediaBaseUrl: 'https://wikipedia.org/w/rest.php/v1',
        },
      }),
    );

    const result = await router.search({
      query: 'verification',
      limit: 5,
      safeSearch: true,
      requestId: 'req-search',
    });

    expect(result.provider).toBe(SearchProviderName.WIKIPEDIA);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        primaryProvider: SearchProviderName.GDELT,
        provider: SearchProviderName.WIKIPEDIA,
        fallbackUsed: true,
      }),
    );
    expect(JSON.stringify(create.mock.calls)).not.toContain('verification');
  });
});

function provider(
  name: SearchProviderName,
  search: SearchProvider['search'],
): SearchProvider {
  return {
    provider: name,
    configured: true,
    search,
    healthCheck: () =>
      Promise.resolve({
        provider: name,
        state: ProviderState.OPERATIONAL,
        checkedAt: new Date(),
        latencyMs: 1,
      }),
  };
}
