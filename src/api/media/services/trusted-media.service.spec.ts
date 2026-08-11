import { ConfigService } from '@nestjs/config';
import { TrustedMediaService } from './trusted-media.service';

describe('TrustedMediaService', () => {
  const service = new TrustedMediaService(
    new ConfigService({
      cloudinary: {
        cloudName: 'verith-cloud',
        maxImageBytes: 10_000_000,
      },
    }),
  );

  it('accepts only the configured Cloudinary delivery namespace', () => {
    expect(
      service.assertTrustedUrl(
        'https://res.cloudinary.com/verith-cloud/image/upload/item.png',
      ).hostname,
    ).toBe('res.cloudinary.com');
    expect(() =>
      service.assertTrustedUrl(
        'https://res.cloudinary.com/another-cloud/image/upload/item.png',
      ),
    ).toThrow('not trusted');
    expect(() =>
      service.assertTrustedUrl('https://example.com/item.png'),
    ).toThrow('not trusted');
  });
});
