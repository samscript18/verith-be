import { ConfigService } from '@nestjs/config';
import { ExternalProviderException } from '../../../core/exceptions';
import { TavilyProvider } from './tavily.provider';

describe('TavilyProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the official search contract without requesting generated answers', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'tvly-1',
          results: [
            {
              title: 'Official source',
              url: 'https://example.gov/source',
              content: 'Search result snippet',
              score: 0.91,
            },
          ],
          usage: { credits: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new TavilyProvider(
      new ConfigService({
        search: {
          timeoutMs: 1000,
          tavily: {
            apiKey: 'secret',
            baseUrl: 'https://api.tavily.com',
          },
        },
      }),
    );

    const result = await provider.search({
      query: 'a factual claim',
      country: 'nigeria',
      recency: 'month',
      limit: 5,
      safeSearch: true,
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string)).toMatchObject({
      query: 'a factual claim',
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
      max_results: 5,
      country: 'nigeria',
      time_range: 'month',
    });
    expect(result.results).toEqual([
      {
        title: 'Official source',
        url: 'https://example.gov/source',
        snippet: 'Search result snippet',
        providerScore: 0.91,
      },
    ]);
    expect(result.requestId).toBe('tvly-1');
  });

  it('reports missing configuration explicitly', async () => {
    const provider = new TavilyProvider(
      new ConfigService({
        search: {
          timeoutMs: 1000,
          tavily: { apiKey: '', baseUrl: 'https://api.tavily.com' },
        },
      }),
    );
    await expect(
      provider.search({ query: 'claim', limit: 1, safeSearch: true }),
    ).rejects.toMatchObject<Partial<ExternalProviderException>>({
      code: 'SEARCH_PROVIDER_NOT_CONFIGURED',
    });
  });

  it.each([
    [401, 'SEARCH_PROVIDER_AUTHENTICATION_FAILED'],
    [429, 'SEARCH_PROVIDER_RATE_LIMITED'],
    [500, 'SEARCH_PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %s to %s', async (status, code) => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status }));
    const provider = new TavilyProvider(
      new ConfigService({
        search: {
          timeoutMs: 1000,
          tavily: {
            apiKey: 'secret',
            baseUrl: 'https://api.tavily.com',
          },
        },
      }),
    );
    await expect(
      provider.search({ query: 'claim', limit: 1, safeSearch: true }),
    ).rejects.toMatchObject({ code });
  });
});
