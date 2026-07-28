import { ArticleExtractionService } from './article-extraction.service';
import { TextNormalizationService } from './text-normalization.service';
import { SafeFetchService } from '../../../shared/services/safe-fetch.service';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';

describe('ArticleExtractionService', () => {
  it('extracts article metadata and removes non-content elements', async () => {
    const safeFetch = {
      fetchHtml: jest.fn().mockResolvedValue({
        requestedUrl: 'https://news.example/story',
        finalUrl: 'https://news.example/story',
        status: 200,
        contentType: 'text/html',
        redirects: 0,
        body: `
          <html><head>
            <title>Example report</title>
            <meta name="author" content="Ada Reporter">
            <meta property="og:site_name" content="Example News">
            <link rel="canonical" href="/canonical-story">
          </head><body>
            <nav>Navigation text</nav>
            <article>
              <p>The city council approved a new tax after a public vote.</p>
              <p>The measure will take effect in January next year.</p>
              <p>Officials published the result during a public meeting.</p>
            </article>
            <script>privateNetworkRequest()</script>
          </body></html>`,
      }),
    };
    const service = new ArticleExtractionService(
      safeFetch as unknown as SafeFetchService,
      new TextNormalizationService(),
    );

    const result = await service.extract('https://news.example/story');
    expect(result).toMatchObject({
      state: UrlExtractionState.PARTIALLY_EXTRACTED,
      title: 'Example report',
      author: 'Ada Reporter',
      publisher: 'Example News',
      canonicalUrl: 'https://news.example/canonical-story',
    });
    expect(result.text).toContain('city council approved');
    expect(result.text).not.toContain('privateNetworkRequest');
    expect(result.text).not.toContain('Navigation text');
  });
});
