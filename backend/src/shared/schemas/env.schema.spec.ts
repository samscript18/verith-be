import { envSchema } from './env.schema';

describe('envSchema', () => {
  it('applies safe application defaults', () => {
    const result = envSchema.validate({
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      APP_NAME: 'Verith',
      PORT: 4000,
      API_PREFIX: 'api/v1',
      WHATSAPP_ENABLED: false,
    });
  });

  it('requires WhatsApp credentials only when enabled', () => {
    const result = envSchema.validate({
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
      WHATSAPP_ENABLED: true,
    });

    expect(result.error?.message).toContain('WHATSAPP_PHONE_NUMBER_ID');
  });
});
