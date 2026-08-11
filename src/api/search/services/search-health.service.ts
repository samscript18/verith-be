import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SearchConfig } from '../../../shared/config';
import type {
  SearchProvider,
  SearchProviderHealth,
} from '../interfaces/search-provider.interface';
import { SEARCH_PROVIDERS } from '../interfaces/search-provider.interface';

@Injectable()
export class SearchHealthService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: SearchProviderHealth }
  >();
  private readonly config: SearchConfig;

  constructor(
    @Inject(SEARCH_PROVIDERS) private readonly providers: SearchProvider[],
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<SearchConfig>('search');
  }

  async all(force = false): Promise<SearchProviderHealth[]> {
    return Promise.all(
      this.providers.map(async (provider) => {
        const cached = this.cache.get(provider.provider);
        if (!force && cached && cached.expiresAt > Date.now())
          return cached.value;
        const value = await provider.healthCheck();
        this.cache.set(provider.provider, {
          value,
          expiresAt: Date.now() + this.config.healthCacheSeconds * 1000,
        });
        return value;
      }),
    );
  }
}
