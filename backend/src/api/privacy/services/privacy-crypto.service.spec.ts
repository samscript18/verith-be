import { ConfigService } from '@nestjs/config';
import { PrivacyCryptoService } from './privacy-crypto.service';

describe('PrivacyCryptoService', () => {
  const service = new PrivacyCryptoService(
    new ConfigService({
      privacy: {
        exportEncryptionKey: 'test-export-encryption-key-with-32-characters',
      },
    }),
  );

  it('encrypts exports and validates unguessable download tokens', () => {
    const original = Buffer.from('{"private":"data"}');
    const encrypted = service.encrypt(original);
    const token = service.token();

    expect(encrypted).not.toContain(original.toString());
    expect(service.decrypt(encrypted)).toEqual(original);
    expect(service.matches(token.raw, token.hash)).toBe(true);
    expect(service.matches(`${token.raw}x`, token.hash)).toBe(false);
  });
});
