import { ConfigService } from '@nestjs/config';
import { ValidationException } from '../../core/exceptions';
import { SafeFetchService } from './safe-fetch.service';

describe('SafeFetchService', () => {
  const service = new SafeFetchService(
    new ConfigService({
      processing: {
        maxTextLength: 50000,
        maxClaims: 20,
        maxQueriesPerClaim: 5,
        urlTimeoutMs: 10000,
        urlMaxBytes: 1024,
        urlMaxRedirects: 3,
        userAgent: 'VerithBot/1.0',
      },
    }),
  );

  it.each([
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]',
    'file:///etc/passwd',
    'https://localhost',
    'https://example.com:8443',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => service.parseAndValidate(url)).toThrow(ValidationException);
  });

  it('accepts a normal HTTPS URL and removes fragments', () => {
    expect(
      service
        .parseAndValidate('https://example.com/article#tracking')
        .toString(),
    ).toBe('https://example.com/article');
  });
});
