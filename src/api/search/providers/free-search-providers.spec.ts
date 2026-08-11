import { ConfigService } from '@nestjs/config';
import { GdeltProvider } from './gdelt.provider';
import { WikipediaProvider } from './wikipedia.provider';

describe('credential-free search providers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the GDELT article-list JSON contract', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          articles: [
            {
              title: 'Official source',
              url: 'https://example.gov/source',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new GdeltProvider(configService());

    const result = await provider.search({
      query: 'a factual claim',
      recency: 'month',
      includeDomains: ['example.gov'],
      limit: 5,
      safeSearch: true,
    });

    const input = fetchMock.mock.calls[0]?.[0];
    if (typeof input !== 'string') throw new Error('Expected a string URL');
    const url = new URL(input);
    expect(url.searchParams.get('mode')).toBe('artlist');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('maxrecords')).toBe('5');
    expect(url.searchParams.get('timespan')).toBe('1month');
    expect(url.searchParams.get('query')).toContain('domainis:example.gov');
    expect(result.results).toEqual([
      {
        title: 'Official source',
        url: 'https://example.gov/source',
        snippet: 'Official source',
        providerScore: 1,
      },
    ]);
  });

  it('normalizes Wikipedia REST search results and strips markup', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          pages: [
            {
              id: 1,
              key: 'Verification',
              title: 'Verification',
              excerpt: '<span class="searchmatch">Verification</span> checks.',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new WikipediaProvider(configService());

    const result = await provider.search({
      query: 'verification',
      language: 'fr-FR',
      limit: 3,
      safeSearch: true,
    });

    const input = fetchMock.mock.calls[0]?.[0];
    if (typeof input !== 'string') throw new Error('Expected a string URL');
    expect(input).toContain('https://fr.wikipedia.org/');
    expect(result.results).toEqual([
      {
        title: 'Verification',
        url: 'https://fr.wikipedia.org/wiki/Verification',
        snippet: 'Verification checks.',
        providerScore: 1,
      },
    ]);
  });

  it.each([GdeltProvider, WikipediaProvider])(
    '%p exposes rate limiting instead of masking it',
    async (Provider) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('', { status: 429 }));
      const provider = new Provider(configService());

      await expect(
        provider.search({ query: 'claim', limit: 1, safeSearch: true }),
      ).rejects.toMatchObject({ code: 'SEARCH_PROVIDER_RATE_LIMITED' });
    },
  );

  it('honors the GDELT cooldown before the router falls back', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('', { status: 429 }));
    const provider = new GdeltProvider(configService());
    const request = { query: 'claim', limit: 1, safeSearch: true };

    await expect(provider.search(request)).rejects.toMatchObject({
      code: 'SEARCH_PROVIDER_RATE_LIMITED',
    });
    await expect(provider.search(request)).rejects.toMatchObject({
      code: 'SEARCH_PROVIDER_RATE_LIMITED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function configService(): ConfigService {
  return new ConfigService({
    search: {
      providerOrder: ['GDELT', 'WIKIPEDIA'],
      timeoutMs: 1000,
      maxRetries: 0,
      maxEvidencePerClaim: 10,
      healthCacheSeconds: 300,
      gdeltBaseUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
      wikipediaBaseUrl: 'https://wikipedia.org/w/rest.php/v1',
    },
  });
}
