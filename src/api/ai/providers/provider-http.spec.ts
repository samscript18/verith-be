import { providerFetch } from './provider-http';

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
});
