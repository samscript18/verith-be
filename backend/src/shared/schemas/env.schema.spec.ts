import { envSchema } from './env.schema';

describe('envSchema', () => {
  it('applies safe application defaults', () => {
    const result = envSchema.validate({
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      HASHING_PEPPER: 'b'.repeat(32),
      DATA_EXPORT_ENCRYPTION_KEY: 'd'.repeat(32),
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
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      HASHING_PEPPER: 'b'.repeat(32),
      DATA_EXPORT_ENCRYPTION_KEY: 'd'.repeat(32),
      MASTER_ENCRYPTION_KEY: 'c'.repeat(32),
      CLOUDINARY_CLOUD_NAME: 'test',
      CLOUDINARY_API_KEY: 'test',
      CLOUDINARY_API_SECRET: 'test',
      WHATSAPP_ENABLED: true,
    });

    expect(result.error?.message).toContain('WHATSAPP_PHONE_NUMBER_ID');
  });

  it('rejects a partial Cloudinary credential set', () => {
    const result = envSchema.validate({
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      HASHING_PEPPER: 'b'.repeat(32),
      DATA_EXPORT_ENCRYPTION_KEY: 'd'.repeat(32),
      CLOUDINARY_CLOUD_NAME: 'verith',
    });

    expect(result.error?.message).toContain('CLOUDINARY_API_KEY');
  });
});
