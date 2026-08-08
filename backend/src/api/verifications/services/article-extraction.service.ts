import { Injectable, Logger, Optional } from '@nestjs/common';
import { load } from 'cheerio';
import { performance } from 'node:perf_hooks';
import { ApplicationException } from '../../../core/exceptions';
import { SafeFetchService } from '../../../shared/services/safe-fetch.service';
import { SearchRouterService } from '../../search/services/search-router.service';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';
import { UrlSourceKind } from '../enums/url-source-kind.enum';
import { TextNormalizationService } from './text-normalization.service';
import { UrlClassificationService } from './url-classification.service';

export interface ArticleExtractionResult {
  outcome: 'READABLE' | 'RESTRICTED';
  state: UrlExtractionState;
  sourceUrl: string;
  canonicalUrl: string;
  title?: string;
  publisher?: string;
  author?: string;
  publishedAt?: Date;
  text: string;
  confidence: number;
  sourceKind: UrlSourceKind;
  socialPostId?: string;
  strategy: 'DIRECT_HTML' | 'SEARCH_PROVIDER_RAW_CONTENT';
  retryable: boolean;
  alternativeInputTypes?: Array<'TEXT' | 'SCREENSHOT'>;
}

export interface ArticleExtractionOptions {
  requestId: string;
  verificationId: string;
}

@Injectable()
export class ArticleExtractionService {
  private readonly logger = new Logger(ArticleExtractionService.name);

  constructor(
    private readonly safeFetch: SafeFetchService,
    private readonly normalization: TextNormalizationService,
    private readonly urls: UrlClassificationService,
    @Optional() private readonly search?: SearchRouterService,
  ) {}

  async extract(
    url: string,
    options?: ArticleExtractionOptions,
  ): Promise<ArticleExtractionResult> {
    const startedAt = performance.now();
    const classified = this.urls.classify(url);
    let fetched;
    try {
      fetched = await this.safeFetch.fetchHtml(classified.normalizedUrl);
    } catch (error) {
      const fallback = await this.providerFallback(classified, options);
      if (fallback) {
        this.logOutcome(classified, fallback, startedAt, options);
        return fallback;
      }
      if (
        classified.kind === UrlSourceKind.SOCIAL_X &&
        error instanceof ApplicationException &&
        ['URL_ACCESS_BLOCKED', 'URL_CONTENT_TYPE_UNSUPPORTED'].includes(
          error.code,
        )
      ) {
        throw new ApplicationException(
          'Verith identified this X post, but X did not provide readable post content',
          422,
          'SOCIAL_CONTENT_RESTRICTED',
          {
            alternativeSubmission: 'PASTE_TEXT_OR_UPLOAD_SCREENSHOT',
            retryRecommended: false,
            socialPostId: classified.socialPostId,
          },
        );
      }
      throw error;
    }
    const $ = load(fetched.body);
    const structured = this.structuredArticle(
      $('script[type="application/ld+json"]')
        .toArray()
        .map((node) => $(node).text()),
    );
    $('script,style,noscript,nav,header,footer,aside,form,iframe,svg').remove();
    $(
      '[class*="advert"],[id*="advert"],[class*="cookie"],[id*="cookie"]',
    ).remove();

    const title = this.first(
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="twitter:title"]').attr('content'),
      $('title').first().text(),
      $('h1').first().text(),
      structured.title,
    );
    const author = this.first(
      $('meta[name="author"]').attr('content'),
      $('[rel="author"]').first().text(),
      $('[class*="author"]').first().text(),
      structured.author,
    );
    const publisher = this.first(
      $('meta[property="og:site_name"]').attr('content'),
      structured.publisher,
      new URL(fetched.finalUrl).hostname.replace(/^www\./, ''),
    );
    const canonicalRaw = this.first(
      $('link[rel="canonical"]').attr('href'),
      $('meta[property="og:url"]').attr('content'),
      fetched.finalUrl,
    );
    const canonicalUrl = this.safeCanonical(canonicalRaw, fetched.finalUrl);
    const publishedAt = this.parseDate(
      this.first(
        $('meta[property="article:published_time"]').attr('content'),
        $('meta[name="date"]').attr('content'),
        $('time[datetime]').first().attr('datetime'),
        structured.publishedAt,
      ),
    );
    const metadataDescription = this.first(
      $('meta[property="og:description"]').attr('content'),
      $('meta[name="twitter:description"]').attr('content'),
      $('meta[name="description"]').attr('content'),
    );

    const root = $('article').first().length
      ? $('article').first()
      : $('main').first().length
        ? $('main').first()
        : $('[itemprop="articleBody"]').first().length
          ? $('[itemprop="articleBody"]').first()
          : $('body');
    const paragraphs = root
      .find('p')
      .toArray()
      .map((node) => this.normalization.normalize($(node).text()))
      .filter((text) => text.length >= 20);
    let text = this.normalization.normalize(
      paragraphs.length
        ? paragraphs.join('\n\n')
        : structured.body || root.text(),
    );
    if (
      classified.kind === UrlSourceKind.SOCIAL_X &&
      text.length < 100 &&
      metadataDescription &&
      metadataDescription.length >= 20
    ) {
      text = this.normalization.normalize(metadataDescription);
    }
    if (!text && metadataDescription && title) {
      text = this.normalization.normalize(metadataDescription);
    }
    const pageText = this.normalization
      .normalize($('body').text())
      .toLowerCase();
    const loginRequired =
      text.length < 500 &&
      /(sign in|log in|create an account) to (continue|read|view)/i.test(
        pageText,
      );
    const paywalled =
      text.length < 1000 &&
      /(subscribe to (continue|read)|subscriber-only|subscription required|premium article)/i.test(
        pageText,
      );
    const automationBlocked =
      text.length < 500 &&
      /(checking your browser|verify you are human|access denied|unusual traffic|captcha)/i.test(
        pageText,
      );
    const javascriptRequired =
      text.length < 500 &&
      /(enable javascript|javascript is required|requires javascript|please turn on javascript)/i.test(
        pageText,
      );
    const meaningfulShortContent =
      text.length >= 20 &&
      (paragraphs.length > 0 ||
        Boolean(structured.body) ||
        Boolean(title && metadataDescription));
    const confidence = this.confidence(text, paragraphs.length, Boolean(title));
    const state =
      classified.kind === UrlSourceKind.SOCIAL_X && loginRequired
        ? UrlExtractionState.SOCIAL_CONTENT_RESTRICTED
        : automationBlocked
          ? UrlExtractionState.AUTOMATION_BLOCKED
          : javascriptRequired
            ? UrlExtractionState.JAVASCRIPT_REQUIRED
            : loginRequired
              ? UrlExtractionState.LOGIN_REQUIRED
              : paywalled
                ? UrlExtractionState.PAYWALLED
                : text.length >= 500
                  ? UrlExtractionState.EXTRACTED
                  : text.length >= 100 || meaningfulShortContent
                    ? UrlExtractionState.PARTIALLY_EXTRACTED
                    : text.length === 0
                      ? UrlExtractionState.CONTENT_EMPTY
                      : UrlExtractionState.CONTENT_UNREADABLE;

    const readable = [
      UrlExtractionState.EXTRACTED,
      UrlExtractionState.PARTIALLY_EXTRACTED,
    ].includes(state);

    const result: ArticleExtractionResult = {
      outcome: readable ? 'READABLE' : 'RESTRICTED',
      state,
      sourceUrl: fetched.requestedUrl,
      canonicalUrl,
      ...(title ? { title } : {}),
      ...(publisher ? { publisher } : {}),
      ...(author ? { author } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      text,
      confidence,
      sourceKind: classified.kind,
      strategy: 'DIRECT_HTML',
      retryable: false,
      ...(!readable
        ? { alternativeInputTypes: ['TEXT', 'SCREENSHOT'] as const }
        : {}),
      ...(classified.socialPostId
        ? { socialPostId: classified.socialPostId }
        : {}),
    };
    this.logOutcome(classified, result, startedAt, options);
    return result;
  }

  private async providerFallback(
    classified: ReturnType<UrlClassificationService['classify']>,
    options?: ArticleExtractionOptions,
  ): Promise<ArticleExtractionResult | null> {
    if (!this.search || !options) return null;
    try {
      const target = new URL(classified.normalizedUrl);
      const page = await this.search.search({
        query: classified.normalizedUrl,
        requestId: options.requestId,
        verificationId: options.verificationId,
        includeDomains: [target.hostname],
        limit: 3,
        safeSearch: true,
      });
      const match = page.results.find(
        (item) =>
          item.rawContent &&
          this.sameResource(item.url, classified.normalizedUrl),
      );
      const text = this.normalization.normalize(match?.rawContent ?? '');
      if (!match || text.length < 20) return null;
      return {
        outcome: 'READABLE',
        state:
          text.length >= 500
            ? UrlExtractionState.EXTRACTED
            : UrlExtractionState.PARTIALLY_EXTRACTED,
        sourceUrl: classified.normalizedUrl,
        canonicalUrl: match.url,
        title: match.title,
        text,
        confidence: text.length >= 500 ? 0.7 : 0.45,
        sourceKind: classified.kind,
        strategy: 'SEARCH_PROVIDER_RAW_CONTENT',
        retryable: false,
        ...(classified.socialPostId
          ? { socialPostId: classified.socialPostId }
          : {}),
      };
    } catch {
      return null;
    }
  }

  private structuredArticle(scripts: string[]): {
    title?: string;
    author?: string;
    publisher?: string;
    publishedAt?: string;
    body?: string;
  } {
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script) as unknown;
        const candidates = this.structuredCandidates(parsed);
        for (const candidate of candidates) {
          const type = candidate['@type'];
          const types = Array.isArray(type) ? type : [type];
          if (
            !types.some((item) =>
              ['Article', 'NewsArticle', 'BlogPosting'].includes(String(item)),
            )
          )
            continue;
          return {
            ...this.stringField(candidate, 'headline', 'title'),
            ...this.nestedName(candidate, 'author', 'author'),
            ...this.nestedName(candidate, 'publisher', 'publisher'),
            ...this.stringField(candidate, 'datePublished', 'publishedAt'),
            ...this.stringField(candidate, 'articleBody', 'body'),
          };
        }
      } catch {
        continue;
      }
    }
    return {};
  }

  private structuredCandidates(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value))
      return value.flatMap((item) => this.structuredCandidates(item));
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    return [record, ...this.structuredCandidates(record['@graph'])];
  }

  private stringField(
    record: Record<string, unknown>,
    source: string,
    target: string,
  ): Record<string, string> {
    const value = record[source];
    return typeof value === 'string' && value.trim()
      ? { [target]: value.trim() }
      : {};
  }

  private nestedName(
    record: Record<string, unknown>,
    source: string,
    target: string,
  ): Record<string, string> {
    const value = record[source];
    const item: unknown = Array.isArray(value)
      ? (value as unknown[])[0]
      : value;
    if (!item || typeof item !== 'object' || !('name' in item)) return {};
    const name = (item as Record<string, unknown>).name;
    return typeof name === 'string' && name.trim()
      ? { [target]: name.trim() }
      : {};
  }

  private safeCanonical(value: string | undefined, fallback: string): string {
    try {
      const url = new URL(value ?? fallback, fallback);
      return ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
        ? url.toString()
        : fallback;
    } catch {
      return fallback;
    }
  }

  private sameResource(left: string, right: string): boolean {
    try {
      const normalize = (value: string) => {
        const url = new URL(value);
        return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
      };
      return normalize(left) === normalize(right);
    } catch {
      return false;
    }
  }

  private logOutcome(
    classified: ReturnType<UrlClassificationService['classify']>,
    result: ArticleExtractionResult,
    startedAt: number,
    options?: ArticleExtractionOptions,
  ): void {
    this.logger.log({
      event: 'url_extraction_completed',
      ...(options ? { verificationId: options.verificationId } : {}),
      host: new URL(classified.normalizedUrl).hostname,
      classification: classified.kind,
      strategy: result.strategy,
      outcome: result.outcome,
      extractionState: result.state,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  private confidence(
    text: string,
    paragraphCount: number,
    hasTitle: boolean,
  ): number {
    let score = 0;
    if (text.length >= 500) score += 0.45;
    else if (text.length >= 100) score += 0.2;
    if (paragraphCount >= 3) score += 0.35;
    else if (paragraphCount) score += 0.15;
    if (hasTitle) score += 0.2;
    return Math.min(1, score);
  }

  private first(...values: Array<string | undefined>): string | undefined {
    return values
      .map((value) => value?.trim())
      .find((value): value is string => Boolean(value));
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
