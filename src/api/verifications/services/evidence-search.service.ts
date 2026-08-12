import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { ApplicationException } from '../../../core/exceptions';
import type { SearchConfig } from '../../../shared/config';
import {
  EvidenceAccessStatus,
  EvidenceAuthority,
  EvidenceLineageType,
  EvidenceRelationship,
} from '../../evidence/enums/evidence.enum';
import { Evidence } from '../../evidence/schemas/evidence.schema';
import type { RoutedSearchResult } from '../../search/interfaces/search-router.interface';
import { SearchRouterService } from '../../search/services/search-router.service';
import { ClaimVerifiability } from '../enums/claim.enum';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';
import { UrlSourceKind } from '../enums/url-source-kind.enum';
import { Claim, type ClaimDocument } from '../schemas/claim.schema';
import type { ArticleExtractionResult } from './article-extraction.service';
import { ArticleExtractionService } from './article-extraction.service';
import { LanguageDetectionService } from './language-detection.service';
import { TextNormalizationService } from './text-normalization.service';

interface EvidenceRetrieval {
  article: ArticleExtractionResult | null;
  failureCode?: string;
  extractionSource?: 'DIRECT_FETCH' | 'TAVILY_EXTRACTED_CONTENT';
}

@Injectable()
export class EvidenceSearchService {
  private readonly config: SearchConfig;
  private readonly logger = new Logger(EvidenceSearchService.name);

  constructor(
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    private readonly search: SearchRouterService,
    private readonly articles: ArticleExtractionService,
    private readonly normalization: TextNormalizationService,
    private readonly languages: LanguageDetectionService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<SearchConfig>('search');
  }

  async searchAndPersist(
    verificationId: string,
    requestId: string,
  ): Promise<number> {
    const verificationObjectId = new Types.ObjectId(verificationId);
    const claims = await this.claimModel
      .find({
        verificationId: verificationObjectId,
        verifiability: {
          $in: [
            ClaimVerifiability.VERIFIABLE,
            ClaimVerifiability.PARTIALLY_VERIFIABLE,
          ],
        },
      })
      .sort({ sequence: 1 })
      .exec();
    await this.evidenceModel
      .deleteMany({ verificationId: verificationObjectId })
      .exec();
    let total = 0;
    const searchCache = new Map<string, Promise<RoutedSearchResult>>();
    const retrievalCache = new Map<string, Promise<EvidenceRetrieval>>();
    this.logger.log({
      event: 'multilingual_evidence_search_started',
      verificationId,
      queryLanguages: [
        ...new Set(
          claims.flatMap((claim) =>
            claim.searchQueries.map((query) => query.language),
          ),
        ),
      ],
      queryCount: claims.reduce(
        (count, claim) => count + claim.searchQueries.length,
        0,
      ),
    });
    for (const claim of claims) {
      total += await this.forClaim(
        verificationId,
        claim,
        requestId,
        searchCache,
        retrievalCache,
      );
    }
    return total;
  }

  async list(verificationId: string): Promise<Record<string, unknown>[]> {
    const verificationObjectId = new Types.ObjectId(verificationId);
    const claims = await this.claimModel
      .find({ verificationId: verificationObjectId })
      .select('_id')
      .lean()
      .exec();
    const claimIds = claims.map((claim) => claim._id);
    const records = await this.evidenceModel
      .find({
        verificationId: verificationObjectId,
        claimId: { $in: claimIds },
      })
      .sort({ claimId: 1, relevanceScore: -1, createdAt: 1 })
      .lean()
      .exec();
    return records.map((item) => ({
      id: item._id.toString(),
      claimId: item.claimId.toString(),
      provider: item.provider,
      searchQuery: item.searchQuery,
      queryCategory: item.queryCategory,
      searchQueryLanguage: item.searchQueryLanguage ?? null,
      searchQuerySource: item.searchQuerySource ?? null,
      sourceUrl: item.sourceUrl,
      canonicalUrl: item.canonicalUrl,
      domain: item.domain,
      publisher: item.publisher ?? null,
      title: item.title,
      author: item.author ?? null,
      publishedAt: item.publishedAt ?? null,
      retrievedAt: item.retrievedAt,
      relevantExcerpt: item.relevantExcerpt ?? null,
      originalExcerpt: item.originalExcerpt ?? item.relevantExcerpt ?? null,
      language: item.language ?? null,
      relationship: item.relationship,
      relevanceScore: item.relevanceScore,
      authority: item.authority,
      recencyScore: item.recencyScore,
      directnessScore: item.directnessScore,
      credibilityScore: item.credibilityScore,
      accessStatus: item.accessStatus,
      lineageType: item.lineageType,
      duplicateOfEvidenceId: item.duplicateOfEvidenceId?.toString() ?? null,
    }));
  }

  private async forClaim(
    verificationId: string,
    claim: ClaimDocument,
    requestId: string,
    searchCache: Map<string, Promise<RoutedSearchResult>>,
    retrievalCache: Map<string, Promise<EvidenceRetrieval>>,
  ): Promise<number> {
    let count = 0;
    const seenUrls = new Set<string>();
    for (const query of claim.searchQueries) {
      if (count >= this.config.maxEvidencePerClaim) break;
      const queryKey = `${query.language}:${this.normalizeQuery(query.query)}`;
      let pendingSearch = searchCache.get(queryKey);
      if (!pendingSearch) {
        pendingSearch = this.search.search({
          query: query.query,
          language: query.language,
          querySource: query.source,
          limit: Math.min(4, this.config.maxEvidencePerClaim - count),
          safeSearch: true,
          requestId,
          verificationId,
          claimId: claim.id,
        });
        searchCache.set(queryKey, pendingSearch);
      }
      const page = await pendingSearch;
      for (const result of page.results) {
        if (count >= this.config.maxEvidencePerClaim) break;
        const normalizedUrl = this.normalizeUrl(result.url);
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
        seenUrls.add(normalizedUrl);
        const retrieval = await this.retrieve(result, retrievalCache);
        const document = this.toEvidence(
          verificationId,
          claim,
          query,
          page.provider,
          result,
          retrieval,
        );
        const duplicate = await this.findLineage(document, claim.id);
        if (duplicate) {
          document.lineageType = duplicate.type;
          document.duplicateOfEvidenceId = duplicate.id;
        }
        await this.evidenceModel.create(document);
        count += 1;
      }
    }
    return count;
  }

  private retrieve(
    result: { url: string; title: string; rawContent?: string },
    cache: Map<string, Promise<EvidenceRetrieval>>,
  ): Promise<EvidenceRetrieval> {
    const key = this.normalizeUrl(result.url) ?? result.url;
    let pending = cache.get(key);
    if (!pending) {
      pending = this.retrieveSource(result);
      cache.set(key, pending);
    }
    return pending;
  }

  private async retrieveSource(result: {
    url: string;
    title: string;
    rawContent?: string;
  }): Promise<EvidenceRetrieval> {
    try {
      return {
        article: await this.articles.extract(result.url),
        extractionSource: 'DIRECT_FETCH',
      };
    } catch (error) {
      const failureCode =
        error instanceof ApplicationException
          ? error.code
          : 'EVIDENCE_DIRECT_FETCH_FAILED';
      const text = this.normalization.normalize(result.rawContent ?? '');
      if (failureCode !== 'VALIDATION_ERROR' && text.length >= 100) {
        return {
          article: {
            // Provider-extracted content is useful but remains explicitly
            // partial because Verith did not retrieve the origin directly.
            state: UrlExtractionState.PARTIALLY_EXTRACTED,
            outcome: 'READABLE',
            sourceUrl: result.url,
            canonicalUrl: result.url,
            title: result.title,
            text,
            confidence: text.length >= 500 ? 0.7 : 0.45,
            sourceKind: UrlSourceKind.STANDARD_WEBPAGE,
            strategy: 'SEARCH_PROVIDER_RAW_CONTENT',
            retryable: false,
          },
          failureCode,
          extractionSource: 'TAVILY_EXTRACTED_CONTENT',
        };
      }
      return {
        article: null,
        failureCode,
      };
    }
  }

  private toEvidence(
    verificationId: string,
    claim: ClaimDocument,
    searchQuery: ClaimDocument['searchQueries'][number],
    provider: Evidence['provider'],
    result: {
      title: string;
      url: string;
      snippet: string;
      providerScore: number;
      rawContent?: string;
    },
    retrieval: EvidenceRetrieval,
  ): Partial<Evidence> {
    const { article } = retrieval;
    const available =
      article &&
      [
        UrlExtractionState.EXTRACTED,
        UrlExtractionState.PARTIALLY_EXTRACTED,
      ].includes(article.state);
    const text = available ? article.text : '';
    const detectedEvidenceLanguage = text
      ? this.languages.detect(text).language
      : undefined;
    const comparisonClaim =
      detectedEvidenceLanguage === claim.originalLanguage
        ? claim.normalizedText
        : this.normalization.normalizeClaim(claim.canonicalText);
    const canonicalUrl =
      this.normalizeUrl(article?.canonicalUrl ?? result.url) ?? result.url;
    const domain = this.domain(canonicalUrl);
    const excerpt = text ? this.excerpt(text, comparisonClaim) : undefined;
    const directness = excerpt
      ? this.lexicalOverlap(excerpt, comparisonClaim)
      : 0;
    const authority = this.authority(domain);
    const recency = this.recency(article?.publishedAt);
    const extractionQuality = !article
      ? 0
      : article.state === UrlExtractionState.EXTRACTED
        ? 1
        : article.strategy === 'SEARCH_PROVIDER_RAW_CONTENT'
          ? 0.45
          : article.sourceKind === UrlSourceKind.SOCIAL_OTHER
            ? 0.4
            : 0.65;
    return {
      verificationId: new Types.ObjectId(verificationId),
      claimId: claim._id,
      provider,
      searchQuery: searchQuery.query,
      queryCategory: searchQuery.category,
      searchQueryLanguage: searchQuery.language,
      searchQuerySource: searchQuery.source,
      sourceUrl: result.url,
      canonicalUrl,
      domain,
      title: article?.title ?? result.title,
      ...(article?.publisher ? { publisher: article.publisher } : {}),
      ...(article?.author ? { author: article.author } : {}),
      ...(article?.publishedAt ? { publishedAt: article.publishedAt } : {}),
      retrievedAt: new Date(),
      contentType: 'text/html',
      ...(text
        ? {
            ...(detectedEvidenceLanguage
              ? { language: detectedEvidenceLanguage }
              : {}),
            ...(excerpt
              ? { relevantExcerpt: excerpt, originalExcerpt: excerpt }
              : {}),
            contentHash: createHash('sha256')
              .update(this.normalization.normalize(text))
              .digest('hex'),
          }
        : {}),
      relationship: EvidenceRelationship.INCONCLUSIVE,
      relevanceScore: this.clamp(
        (result.providerScore * 0.45 +
          directness * 0.35 +
          this.authorityScore(authority) * 0.15 +
          recency * 0.05) *
          extractionQuality,
      ),
      authority,
      recencyScore: recency,
      directnessScore: this.clamp(directness * extractionQuality),
      credibilityScore: this.authorityScore(authority),
      accessStatus: available
        ? article.state === UrlExtractionState.EXTRACTED
          ? EvidenceAccessStatus.AVAILABLE
          : EvidenceAccessStatus.PARTIALLY_AVAILABLE
        : this.accessStatus(article?.state, retrieval.failureCode),
      lineageType: EvidenceLineageType.UNIQUE,
      metadata: {
        searchSnippet: result.snippet,
        searchSnippetIsEvidence: false,
        originalLanguage: detectedEvidenceLanguage ?? null,
        providerScore: result.providerScore,
        extractionQuality,
        extractionState: article?.state ?? null,
        ...(retrieval.failureCode
          ? { retrievalFailureCode: retrieval.failureCode }
          : {}),
        ...(retrieval.extractionSource
          ? { extractionSource: retrieval.extractionSource }
          : {}),
      },
    };
  }

  private async findLineage(
    document: Partial<Evidence>,
    claimId: string,
  ): Promise<{ id: Types.ObjectId; type: EvidenceLineageType } | null> {
    if (!document.canonicalUrl) return null;
    const exact = await this.evidenceModel
      .findOne({
        claimId: new Types.ObjectId(claimId),
        $or: [
          { canonicalUrl: document.canonicalUrl },
          ...(document.contentHash
            ? [{ contentHash: document.contentHash }]
            : []),
        ],
      })
      .select('_id')
      .lean()
      .exec();
    if (exact) return { id: exact._id, type: EvidenceLineageType.DUPLICATE };
    if (!document.title) return null;
    const candidates = await this.evidenceModel
      .find({
        claimId: new Types.ObjectId(claimId),
        ...(document.publisher ? { publisher: document.publisher } : {}),
      })
      .select('_id title publishedAt')
      .lean()
      .exec();
    const syndicated = candidates.find(
      (item) =>
        this.lexicalOverlap(item.title, document.title!) >= 0.8 &&
        this.closeDates(item.publishedAt, document.publishedAt),
    );
    return syndicated
      ? {
          id: syndicated._id,
          type: EvidenceLineageType.SYNDICATED_CANDIDATE,
        }
      : null;
  }

  private excerpt(text: string, claim: string): string {
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences
      .map((sentence) => ({
        sentence,
        score: this.lexicalOverlap(sentence, claim),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.sentence)
      .join(' ')
      .slice(0, 1500);
  }

  private lexicalOverlap(left: string, right: string): number {
    const a = new Set(this.words(left));
    const b = new Set(this.words(right));
    if (!a.size || !b.size) return 0;
    let matches = 0;
    for (const word of b) if (a.has(word)) matches += 1;
    return this.clamp(matches / b.size);
  }

  private words(value: string): string[] {
    return value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  }

  private normalizeUrl(value: string): string | null {
    try {
      const url = new URL(value);
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
      }
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      return url.toString();
    } catch {
      return null;
    }
  }

  private normalizeQuery(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private domain(value: string): string {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  private authority(domain: string): EvidenceAuthority {
    if (/(^|\.)gov(\.[a-z]{2})?$/.test(domain)) return EvidenceAuthority.HIGH;
    if (/(^|\.)edu(\.[a-z]{2})?$/.test(domain))
      return EvidenceAuthority.MODERATE;
    return domain === 'unknown'
      ? EvidenceAuthority.INSUFFICIENT_INFORMATION
      : EvidenceAuthority.UNKNOWN;
  }

  private authorityScore(value: EvidenceAuthority): number {
    return value === EvidenceAuthority.HIGH
      ? 1
      : value === EvidenceAuthority.MODERATE
        ? 0.7
        : value === EvidenceAuthority.UNKNOWN
          ? 0.5
          : 0;
  }

  private recency(date?: Date): number {
    if (!date) return 0;
    const days = (Date.now() - date.getTime()) / 86_400_000;
    return this.clamp(1 - Math.max(days, 0) / 1825);
  }

  private closeDates(left?: Date, right?: Date): boolean {
    if (!left || !right) return true;
    return Math.abs(left.getTime() - right.getTime()) <= 7 * 86_400_000;
  }

  private accessStatus(
    state?: UrlExtractionState,
    failureCode?: string,
  ): EvidenceAccessStatus {
    if (failureCode === 'URL_NOT_FOUND') return EvidenceAccessStatus.NOT_FOUND;
    if (failureCode === 'URL_ACCESS_BLOCKED')
      return EvidenceAccessStatus.BLOCKED;
    if (failureCode === 'URL_FETCH_TIMEOUT')
      return EvidenceAccessStatus.TIMEOUT;
    if (failureCode === 'VALIDATION_ERROR')
      return EvidenceAccessStatus.UNSAFE_URL;
    if (state === UrlExtractionState.NOT_FOUND)
      return EvidenceAccessStatus.NOT_FOUND;
    if (state === UrlExtractionState.BLOCKED)
      return EvidenceAccessStatus.BLOCKED;
    if (state === UrlExtractionState.TIMEOUT)
      return EvidenceAccessStatus.TIMEOUT;
    if (state === UrlExtractionState.UNSAFE_URL)
      return EvidenceAccessStatus.UNSAFE_URL;
    if (state) return EvidenceAccessStatus.UNSUPPORTED;
    return EvidenceAccessStatus.FETCH_FAILED;
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }
}
