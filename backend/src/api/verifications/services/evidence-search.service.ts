import { Injectable } from '@nestjs/common';
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
import { SearchRouterService } from '../../search/services/search-router.service';
import { ClaimVerifiability } from '../enums/claim.enum';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';
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
    const claims = await this.claimModel
      .find({
        verificationId: new Types.ObjectId(verificationId),
        verifiability: {
          $in: [
            ClaimVerifiability.VERIFIABLE,
            ClaimVerifiability.PARTIALLY_VERIFIABLE,
          ],
        },
      })
      .sort({ sequence: 1 })
      .exec();
    await this.evidenceModel.deleteMany({ verificationId }).exec();
    let total = 0;
    for (const claim of claims) {
      total += await this.forClaim(verificationId, claim, requestId);
    }
    return total;
  }

  async list(verificationId: string): Promise<Record<string, unknown>[]> {
    const records = await this.evidenceModel
      .find({ verificationId: new Types.ObjectId(verificationId) })
      .sort({ claimId: 1, relevanceScore: -1, createdAt: 1 })
      .lean()
      .exec();
    return records.map((item) => ({
      id: item._id.toString(),
      claimId: item.claimId.toString(),
      provider: item.provider,
      searchQuery: item.searchQuery,
      queryCategory: item.queryCategory,
      sourceUrl: item.sourceUrl,
      canonicalUrl: item.canonicalUrl,
      domain: item.domain,
      publisher: item.publisher ?? null,
      title: item.title,
      author: item.author ?? null,
      publishedAt: item.publishedAt ?? null,
      retrievedAt: item.retrievedAt,
      relevantExcerpt: item.relevantExcerpt ?? null,
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
  ): Promise<number> {
    let count = 0;
    const seenUrls = new Set<string>();
    for (const query of claim.searchQueries) {
      if (count >= this.config.maxEvidencePerClaim) break;
      const page = await this.search.search({
        query: query.query,
        limit: Math.min(5, this.config.maxEvidencePerClaim - count),
        safeSearch: true,
        requestId,
        verificationId,
        claimId: claim.id,
      });
      for (const result of page.results) {
        if (count >= this.config.maxEvidencePerClaim) break;
        const normalizedUrl = this.normalizeUrl(result.url);
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
        seenUrls.add(normalizedUrl);
        const retrieval = await this.retrieve(result);
        const document = this.toEvidence(
          verificationId,
          claim,
          query.query,
          query.category,
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

  private async retrieve(result: {
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
            sourceUrl: result.url,
            canonicalUrl: result.url,
            title: result.title,
            text,
            confidence: text.length >= 500 ? 0.7 : 0.45,
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
    searchQuery: string,
    queryCategory: ClaimDocument['searchQueries'][number]['category'],
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
    const canonicalUrl =
      this.normalizeUrl(article?.canonicalUrl ?? result.url) ?? result.url;
    const domain = this.domain(canonicalUrl);
    const excerpt = text ? this.excerpt(text, claim.normalizedText) : undefined;
    const directness = excerpt
      ? this.lexicalOverlap(excerpt, claim.normalizedText)
      : 0;
    const authority = this.authority(domain);
    const recency = this.recency(article?.publishedAt);
    return {
      verificationId: new Types.ObjectId(verificationId),
      claimId: claim._id,
      provider,
      searchQuery,
      queryCategory,
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
            language: this.languages.detect(text).language,
            ...(excerpt ? { relevantExcerpt: excerpt } : {}),
            contentHash: createHash('sha256')
              .update(this.normalization.normalize(text))
              .digest('hex'),
          }
        : {}),
      relationship: EvidenceRelationship.INCONCLUSIVE,
      relevanceScore: this.clamp(
        result.providerScore * 0.45 +
          directness * 0.35 +
          this.authorityScore(authority) * 0.15 +
          recency * 0.05,
      ),
      authority,
      recencyScore: recency,
      directnessScore: directness,
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
        providerScore: result.providerScore,
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
