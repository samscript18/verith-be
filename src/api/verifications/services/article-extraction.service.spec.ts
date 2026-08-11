import { ArticleExtractionService } from './article-extraction.service';
import { TextNormalizationService } from './text-normalization.service';
import { SafeFetchService } from '../../../shared/services/safe-fetch.service';
import { ExternalProviderException } from '../../../core/exceptions';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';
import { UrlClassificationService } from './url-classification.service';
import { SearchRouterService } from '../../search/services/search-router.service';

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
      new UrlClassificationService(),
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

  it('uses available X metadata without inventing inaccessible post text', async () => {
    const safeFetch = {
      fetchHtml: jest.fn().mockResolvedValue({
        requestedUrl: 'https://x.com/reporter/status/1234567890',
        finalUrl: 'https://x.com/reporter/status/1234567890',
        status: 200,
        contentType: 'text/html',
        redirects: 0,
        body: `
          <html><head>
            <meta property="og:title" content="Reporter on X">
            <meta property="og:description" content="The electoral commission published the final turnout figures on Friday.">
          </head><body><main>Sign in to X</main></body></html>`,
      }),
    };
    const service = new ArticleExtractionService(
      safeFetch as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
    );

    const result = await service.extract(
      'https://twitter.com/reporter/status/1234567890?s=20',
    );

    expect(safeFetch.fetchHtml).toHaveBeenCalledWith(
      'https://x.com/reporter/status/1234567890',
    );
    expect(result).toMatchObject({
      state: UrlExtractionState.PARTIALLY_EXTRACTED,
      socialPostId: '1234567890',
      text: 'The electoral commission published the final turnout figures on Friday.',
    });
  });

  it('accepts a short but meaningful page instead of using length alone', async () => {
    const safeFetch = {
      fetchHtml: jest.fn().mockResolvedValue({
        requestedUrl: 'https://example.com/notice',
        finalUrl: 'https://example.com/notice',
        status: 200,
        contentType: 'text/html',
        redirects: 0,
        body: '<main><h1>Public notice</h1><p>Polls close at 6 PM on Friday.</p></main>',
      }),
    };
    const service = new ArticleExtractionService(
      safeFetch as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
    );

    await expect(
      service.extract('https://example.com/notice'),
    ).resolves.toMatchObject({
      outcome: 'READABLE',
      state: UrlExtractionState.PARTIALLY_EXTRACTED,
      text: 'Polls close at 6 PM on Friday.',
    });
  });

  it.each([
    [
      'Please enable JavaScript to continue',
      UrlExtractionState.JAVASCRIPT_REQUIRED,
    ],
    [
      'Checking your browser. Verify you are human.',
      UrlExtractionState.AUTOMATION_BLOCKED,
    ],
  ])('classifies restricted shell: %s', async (body, state) => {
    const service = new ArticleExtractionService(
      {
        fetchHtml: jest.fn().mockResolvedValue({
          requestedUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          status: 200,
          contentType: 'text/html',
          redirects: 0,
          body: `<body>${body}</body>`,
        }),
      } as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
    );
    await expect(service.extract('https://example.com')).resolves.toMatchObject(
      {
        outcome: 'RESTRICTED',
        state,
        alternativeInputTypes: ['TEXT', 'SCREENSHOT'],
      },
    );
  });

  it('extracts safe article JSON-LD when visible article markup is sparse', async () => {
    const service = new ArticleExtractionService(
      {
        fetchHtml: jest.fn().mockResolvedValue({
          requestedUrl: 'https://news.example/story',
          finalUrl: 'https://news.example/story',
          status: 200,
          contentType: 'text/html',
          redirects: 0,
          body: `<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: 'Election update', articleBody: 'The commission released the certified result after the final count.', author: { name: 'Ada Reporter' }, publisher: { name: 'Example News' }, datePublished: '2026-08-08T10:00:00Z' })}</script><main></main>`,
        }),
      } as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
    );
    await expect(
      service.extract('https://news.example/story'),
    ).resolves.toMatchObject({
      title: 'Election update',
      author: 'Ada Reporter',
      publisher: 'Example News',
      text: 'The commission released the certified result after the final count.',
      state: UrlExtractionState.PARTIALLY_EXTRACTED,
    });
  });

  it('returns actionable restricted-content state when X blocks retrieval', async () => {
    const safeFetch = {
      fetchHtml: jest
        .fn()
        .mockRejectedValue(
          new ExternalProviderException(
            'The submitted URL could not be retrieved safely',
            'URL_ACCESS_BLOCKED',
          ),
        ),
    };
    const service = new ArticleExtractionService(
      safeFetch as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
    );

    await expect(
      service.extract('https://x.com/reporter/status/1234567890'),
    ).rejects.toMatchObject({
      code: 'SOCIAL_CONTENT_RESTRICTED',
      details: {
        alternativeSubmission: 'PASTE_TEXT_OR_UPLOAD_SCREENSHOT',
        retryRecommended: false,
        socialPostId: '1234567890',
      },
    });
  });

  it('uses matching provider raw content after a permitted direct-fetch failure', async () => {
    const safeFetch = {
      fetchHtml: jest
        .fn()
        .mockRejectedValue(
          new ExternalProviderException(
            'The submitted URL could not be retrieved safely',
            'URL_ACCESS_BLOCKED',
          ),
        ),
    };
    const search = {
      search: jest.fn().mockResolvedValue({
        provider: 'TAVILY',
        results: [
          {
            title: 'Accessible provider extraction',
            url: 'https://example.com/story',
            snippet: 'This snippet must not be used as evidence.',
            rawContent:
              'The election commission published the certified results after observers completed their review. The complete notice includes district totals and the certification date.',
            providerScore: 0.8,
          },
        ],
      }),
    };
    const service = new ArticleExtractionService(
      safeFetch as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
      search as unknown as SearchRouterService,
    );

    const result = await service.extract('https://example.com/story', {
      requestId: 'request-1',
      verificationId: '507f1f77bcf86cd799439011',
    });
    expect(result).toMatchObject({
      outcome: 'READABLE',
      strategy: 'SEARCH_PROVIDER_RAW_CONTENT',
    });
    expect(result.text).not.toContain('snippet must not be used');
  });

  it('never promotes a search snippet when provider raw content is absent', async () => {
    const directFailure = new ExternalProviderException(
      'The submitted URL could not be retrieved safely',
      'URL_ACCESS_BLOCKED',
    );
    const service = new ArticleExtractionService(
      {
        fetchHtml: jest.fn().mockRejectedValue(directFailure),
      } as unknown as SafeFetchService,
      new TextNormalizationService(),
      new UrlClassificationService(),
      {
        search: jest.fn().mockResolvedValue({
          provider: 'TAVILY',
          results: [
            {
              title: 'Search result',
              url: 'https://example.com/story',
              snippet:
                'A long search snippet that is metadata, not retrieved source content.',
              providerScore: 0.8,
            },
          ],
        }),
      } as unknown as SearchRouterService,
    );

    await expect(
      service.extract('https://example.com/story', {
        requestId: 'request-2',
        verificationId: '507f1f77bcf86cd799439011',
      }),
    ).rejects.toBe(directFailure);
  });
});
