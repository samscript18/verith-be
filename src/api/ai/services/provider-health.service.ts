import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../../shared/config';
import type {
  AiProvider,
  ProviderHealthResult,
} from '../interfaces/ai-provider.interface';
import { AI_PROVIDERS } from '../interfaces/ai-provider.interface';

@Injectable()
export class ProviderHealthService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; result: ProviderHealthResult }
  >();
  private readonly ttlMs: number;

  constructor(
    @Inject(AI_PROVIDERS) private readonly providers: AiProvider[],
    configService: ConfigService,
  ) {
    this.ttlMs =
      configService.getOrThrow<AiConfig>('ai').healthCacheSeconds * 1000;
  }

  async all(force = false): Promise<ProviderHealthResult[]> {
    return Promise.all(
      this.providers.map((provider) => this.forProvider(provider, force)),
    );
  }

  async forProvider(
    provider: AiProvider,
    force = false,
  ): Promise<ProviderHealthResult> {
    const cached = this.cache.get(provider.provider);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.result;
    const result = await provider.healthCheck();
    this.cache.set(provider.provider, {
      expiresAt: Date.now() + this.ttlMs,
      result,
    });
    return result;
  }
}
