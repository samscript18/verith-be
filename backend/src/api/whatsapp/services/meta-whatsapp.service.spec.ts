import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MetaWhatsAppService } from './meta-whatsapp.service';

describe('MetaWhatsAppService', () => {
  const config = {
    enabled: true,
    phoneNumberId: 'phone-id',
    businessAccountId: 'business-id',
    accessToken: 'access-token',
    appSecret: 'app-secret',
    verifyToken: 'verify-token',
    apiVersion: 'v23.0',
    baseUrl: 'https://graph.facebook.com',
    reportDeepLinkBase: 'https://verith.example/reports',
    hashingPepper: 'h'.repeat(32),
    encryptionKey: 'e'.repeat(32),
    maxImageBytes: 1000,
    maxAudioBytes: 2000,
  };
  const service = new MetaWhatsAppService({
    getOrThrow: jest.fn().mockReturnValue(config),
  } as unknown as ConfigService);

  it('validates verification tokens and signed raw payloads', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${createHmac('sha256', config.appSecret)
      .update(body)
      .digest('hex')}`;
    expect(service.verifyWebhookToken('subscribe', 'verify-token')).toBe(true);
    expect(service.verifyWebhookToken('subscribe', 'wrong')).toBe(false);
    expect(service.verifySignature(body, signature)).toBe(true);
    expect(service.verifySignature(Buffer.from('{}'), signature)).toBe(false);
    expect(service.verifySignature(body, 'sha256=short')).toBe(false);
  });
});
