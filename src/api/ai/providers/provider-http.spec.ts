import { parseJsonText, providerFetch } from './provider-http';

describe('parseJsonText', () => {
  it('accepts a single fenced JSON document without guessing at partial data', () => {
    expect(parseJsonText('```json\n{"value":"ok"}\n```', 'TEST')).toEqual({
      value: 'ok',
    });
  });

  it('preserves provider stop diagnostics and a specific truncation code', () => {
    let failure: unknown;
    try {
      parseJsonText('{"value":', 'TEST', {
        invalidCode: 'TEST_OUTPUT_TRUNCATED',
        operatorDetails: { stopReason: 'max_tokens', outputTokens: 10000 },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: 'TEST_OUTPUT_TRUNCATED',
      operatorDetails: {
        stopReason: 'max_tokens',
        outputTokens: 10000,
        startsWithJsonContainer: true,
        endsWithJsonContainer: false,
      },
    });
  });
});

describe('providerFetch', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [400, 'TEST_INVALID_REQUEST'],
    [402, 'TEST_BILLING_REQUIRED'],
    [404, 'TEST_INVALID_MODEL'],
    [408, 'TEST_TIMEOUT'],
    [422, 'TEST_INVALID_REQUEST'],
    [429, 'TEST_RATE_LIMITED'],
    [504, 'TEST_TIMEOUT'],
  ])(
    'classifies HTTP %i without exposing the provider body',
    async (status, code) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response('{"error":"provider detail"}', { status }),
        );

      await expect(
        providerFetch('https://provider.example', {}, 100, 'TEST'),
      ).rejects.toMatchObject({ code });
    },
  );

  it('classifies a locally aborted request as a timeout', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    await expect(
      providerFetch('https://provider.example', {}, 1, 'TEST'),
    ).rejects.toMatchObject({ code: 'TEST_TIMEOUT' });
  });

  it('retains safe provider diagnostics while redacting credentials', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            status: 'INVALID_ARGUMENT',
            message: 'Invalid key=super-secret and Bearer private-token',
          },
        }),
        {
          status: 400,
          headers: { 'x-goog-request-id': 'provider-request-1' },
        },
      ),
    );

    await expect(
      providerFetch('https://provider.example', {}, 100, 'TEST'),
    ).rejects.toMatchObject({
      code: 'TEST_INVALID_REQUEST',
      details: null,
      operatorDetails: {
        httpStatus: 400,
        providerStatus: 'INVALID_ARGUMENT',
        providerRequestId: 'provider-request-1',
        providerMessage: 'Invalid key=[REDACTED] and Bearer [REDACTED]',
      },
    });
  });
});
