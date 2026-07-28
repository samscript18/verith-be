import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import { SafeFetchService } from '../../../shared/services/safe-fetch.service';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';
import { TextNormalizationService } from './text-normalization.service';

export interface ArticleExtractionResult {
  state: UrlExtractionState;
  sourceUrl: string;
  canonicalUrl: string;
  title?: string;
  publisher?: string;
  author?: string;
  publishedAt?: Date;
  text: string;
  confidence: number;
}

@Injectable()
export class ArticleExtractionService {
  constructor(
    private readonly safeFetch: SafeFetchService,
    private readonly normalization: TextNormalizationService,
  ) {}

  async extract(url: string): Promise<ArticleExtractionResult> {
    const fetched = await this.safeFetch.fetchHtml(url);
    const $ = load(fetched.body);
    $('script,style,noscript,nav,header,footer,aside,form,iframe,svg').remove();
    $(
      '[class*="advert"],[id*="advert"],[class*="cookie"],[id*="cookie"]',
    ).remove();

    const title = this.first(
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="twitter:title"]').attr('content'),
      $('title').first().text(),
      $('h1').first().text(),
    );
    const author = this.first(
      $('meta[name="author"]').attr('content'),
      $('[rel="author"]').first().text(),
      $('[class*="author"]').first().text(),
    );
    const publisher = this.first(
      $('meta[property="og:site_name"]').attr('content'),
      new URL(fetched.finalUrl).hostname.replace(/^www\./, ''),
    );
    const canonicalRaw = this.first(
      $('link[rel="canonical"]').attr('href'),
      $('meta[property="og:url"]').attr('content'),
      fetched.finalUrl,
    );
    const canonicalUrl = canonicalRaw
      ? new URL(canonicalRaw, fetched.finalUrl).toString()
      : fetched.finalUrl;
    const publishedAt = this.parseDate(
      this.first(
        $('meta[property="article:published_time"]').attr('content'),
        $('meta[name="date"]').attr('content'),
        $('time[datetime]').first().attr('datetime'),
      ),
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
    const text = this.normalization.normalize(
      paragraphs.length ? paragraphs.join('\n\n') : root.text(),
    );
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
    const confidence = this.confidence(text, paragraphs.length, Boolean(title));
    const state = loginRequired
      ? UrlExtractionState.LOGIN_REQUIRED
      : paywalled
        ? UrlExtractionState.PAYWALLED
        : text.length >= 500
          ? UrlExtractionState.EXTRACTED
          : text.length >= 100
            ? UrlExtractionState.PARTIALLY_EXTRACTED
            : UrlExtractionState.UNSUPPORTED;

    return {
      state,
      sourceUrl: fetched.requestedUrl,
      canonicalUrl,
      ...(title ? { title } : {}),
      ...(publisher ? { publisher } : {}),
      ...(author ? { author } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      text,
      confidence,
    };
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
