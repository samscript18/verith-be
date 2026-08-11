import { UrlSourceKind } from '../enums/url-source-kind.enum';
import { UrlClassificationService } from './url-classification.service';

describe('UrlClassificationService', () => {
  const service = new UrlClassificationService();

  it.each([
    [
      'https://twitter.com/example/status/123456789?s=20#fragment',
      'https://x.com/example/status/123456789',
      '123456789',
    ],
    [
      'https://x.com/i/web/status/987654321/photo/1',
      'https://x.com/i/web/status/987654321',
      '987654321',
    ],
  ])('normalizes X status URL %s', (input, normalizedUrl, socialPostId) => {
    expect(service.classify(input)).toEqual({
      normalizedUrl,
      kind: UrlSourceKind.SOCIAL_X,
      socialPostId,
    });
  });

  it.each([
    ['https://example.com/news/story-name', UrlSourceKind.NEWS_ARTICLE],
    ['https://example.com/about', UrlSourceKind.STANDARD_WEBPAGE],
    ['https://example.com/report.pdf', UrlSourceKind.DOCUMENT],
    ['https://example.com/clip.mp4', UrlSourceKind.MEDIA_PAGE],
    ['https://www.instagram.com/p/example', UrlSourceKind.SOCIAL_OTHER],
  ])('classifies %s as %s', (input, kind) => {
    expect(service.classify(input).kind).toBe(kind);
  });
});
