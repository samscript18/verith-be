import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { ExternalProviderException } from '../../../core/exceptions';
import type { SearchConfig } from '../../../shared/config';
import type { SearchProvider } from '../interfaces/search-provider.interface';
import { SEARCH_PROVIDERS } from '../interfaces/search-provider.interface';
import type {
  RoutedSearchRequest,
  RoutedSearchResult,
} from '../interfaces/search-router.interface';
import { SearchExecution } from '../schemas/search-execution.schema';

@Injectable()
export class SearchRouterService {
  private readonly config: SearchConfig;

  constructor(
    @Inject(SEARCH_PROVIDERS) private readonly providers: SearchProvider[],
    @InjectModel(SearchExecution.name)
    private readonly executionModel: Model<SearchExecution>,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<SearchConfig>('search');
  }

  async search(request: RoutedSearchRequest): Promise<RoutedSearchResult> {
    const candidates = [
      this.config.primaryProvider,
      this.config.fallbackProvider,
    ]
      .filter((name, index, all) => name && all.indexOf(name) === index)
      .map((name) =>
        this.providers.find((item) => String(item.provider) === name),
      )
      .filter((item): item is SearchProvider => Boolean(item));
    if (!candidates.some((provider) => provider.configured)) {
      throw new ExternalProviderException(
        'No search provider is configured',
        'SEARCH_PROVIDER_NOT_CONFIGURED',
      );
    }
    let lastCode = 'SEARCH_PROVIDER_UNAVAILABLE';
    for (const provider of candidates.filter((item) => item.configured)) {
      for (
        let attempt = 1;
        attempt <= this.config.maxRetries + 1;
        attempt += 1
      ) {
        const startedAt = new Date();
        try {
          const result = await provider.search(request);
          await this.record(request, provider, startedAt, {
            success: true,
            resultCount: result.results.length,
            ...(result.requestId
              ? { providerRequestId: result.requestId }
              : {}),
            ...(result.creditsUsed !== undefined
              ? { creditsUsed: result.creditsUsed }
              : {}),
          });
          return result;
        } catch (error) {
          lastCode =
            error instanceof ExternalProviderException
              ? error.code
              : 'SEARCH_PROVIDER_UNAVAILABLE';
          await this.record(request, provider, startedAt, {
            success: false,
            safeFailureCode: lastCode,
          });
          if (!this.retryable(lastCode)) break;
        }
      }
    }
    throw new ExternalProviderException(
      'No search provider completed the request',
      lastCode,
    );
  }

  private retryable(code: string): boolean {
    return ['SEARCH_PROVIDER_TIMEOUT', 'SEARCH_PROVIDER_UNAVAILABLE'].includes(
      code,
    );
  }

  private async record(
    request: RoutedSearchRequest,
    provider: SearchProvider,
    startedAt: Date,
    result: {
      success: boolean;
      safeFailureCode?: string;
      resultCount?: number;
      providerRequestId?: string;
      creditsUsed?: number;
    },
  ): Promise<void> {
    const endedAt = new Date();
    await this.executionModel.create({
      ...(request.verificationId
        ? { verificationId: new Types.ObjectId(request.verificationId) }
        : {}),
      ...(request.claimId
        ? { claimId: new Types.ObjectId(request.claimId) }
        : {}),
      requestId: request.requestId,
      provider: provider.provider,
      queryFingerprint: createHash('sha256')
        .update(request.query)
        .digest('hex'),
      startedAt,
      endedAt,
      latencyMs: endedAt.getTime() - startedAt.getTime(),
      ...result,
    });
  }
}
