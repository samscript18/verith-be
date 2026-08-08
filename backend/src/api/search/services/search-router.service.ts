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
    const candidates = this.config.providerOrder
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
    const primaryProvider = candidates.find((provider) => provider.configured)!;
    let lastCode = 'SEARCH_PROVIDER_UNAVAILABLE';
    let emptyResult: RoutedSearchResult | undefined;
    // Search providers already enforce their own request timeout. Use at most
    // one request per provider and one fallback, avoiding six-call fan-out.
    for (const provider of candidates
      .filter((item) => item.configured)
      .slice(0, 2)) {
      const startedAt = new Date();
      try {
        const result = await provider.search(request);
        await this.record(request, provider, primaryProvider, startedAt, {
          success: true,
          resultCount: result.results.length,
          ...(result.requestId ? { providerRequestId: result.requestId } : {}),
          ...(result.creditsUsed !== undefined
            ? { creditsUsed: result.creditsUsed }
            : {}),
        });
        if (result.results.length) return result;
        emptyResult ??= result;
        break;
      } catch (error) {
        lastCode =
          error instanceof ExternalProviderException
            ? error.code
            : 'SEARCH_PROVIDER_UNAVAILABLE';
        await this.record(request, provider, primaryProvider, startedAt, {
          success: false,
          safeFailureCode: lastCode,
        });
      }
    }
    if (emptyResult) return emptyResult;
    throw new ExternalProviderException(
      'No search provider completed the request',
      lastCode,
    );
  }

  private async record(
    request: RoutedSearchRequest,
    provider: SearchProvider,
    primaryProvider: SearchProvider,
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
      primaryProvider: primaryProvider.provider,
      fallbackUsed: provider.provider !== primaryProvider.provider,
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
