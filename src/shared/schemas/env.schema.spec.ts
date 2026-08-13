import { envSchema } from './env.schema';

const base = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
  HASHING_PEPPER: 'hashing-pepper-with-at-least-32-characters',
  DATA_EXPORT_ENCRYPTION_KEY: 'export-key-with-at-least-32-characters',
};

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
      PORT: 4000,
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
      THROTTLER_STORAGE: 'memory',
      API_REPLICA_COUNT: 1,
    });
  });

  it('keeps API documentation private by default in production', () => {
    const result = envSchema.validate({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      HASHING_PEPPER: 'b'.repeat(32),
      DATA_EXPORT_ENCRYPTION_KEY: 'd'.repeat(32),
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ SWAGGER_ENABLED: false });
  });

  it('requires distributed throttling for multiple API replicas', () => {
    const result = envSchema.validate({
      MONGODB_URI: 'mongodb://localhost:27017/verith',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      HASHING_PEPPER: 'b'.repeat(32),
      DATA_EXPORT_ENCRYPTION_KEY: 'd'.repeat(32),
      API_REPLICA_COUNT: 2,
      THROTTLER_STORAGE: 'memory',
    });

    expect(result.error?.message).toContain('THROTTLER_STORAGE must be redis');
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

describe('AI reliability environment validation', () => {
  it('requires project, location, and a model when Vertex is enabled', () => {
    const result = envSchema.validate({ ...base, VERTEX_AI_ENABLED: true });
    expect(result.error?.message).toContain(
      'VERTEX_AI_ENABLED requires VERTEX_PROJECT_ID',
    );
  });

  it('requires region and a model when Bedrock is enabled', () => {
    const result = envSchema.validate({ ...base, BEDROCK_ENABLED: true });
    expect(result.error?.message).toContain(
      'BEDROCK_ENABLED requires BEDROCK_REGION',
    );
  });

  it('rejects an active cost guard without current model pricing', () => {
    const result = envSchema.validate({
      ...base,
      VERTEX_AI_ENABLED: true,
      VERTEX_PROJECT_ID: 'verith-project',
      VERTEX_LOCATION: 'us-central1',
      VERTEX_MODEL_TEXT: 'actual-model',
      AI_COST_GUARD_ENABLED: true,
    });
    expect(result.error?.message).toContain(
      'AI_MODEL_PRICING_JSON is required',
    );
  });

  it('accepts complete model-aware pricing and ordered thresholds', () => {
    const result = envSchema.validate({
      ...base,
      VERTEX_AI_ENABLED: true,
      VERTEX_PROJECT_ID: 'verith-project',
      VERTEX_LOCATION: 'us-central1',
      VERTEX_MODEL_TEXT: 'actual-model',
      AI_COST_GUARD_ENABLED: true,
      AI_MODEL_PRICING_JSON: JSON.stringify({
        'VERTEX:actual-model': {
          inputUsdPerMillion: 0.5,
          outputUsdPerMillion: 3,
        },
      }),
      AI_BUDGET_CONSERVE_PERCENT: 70,
      AI_BUDGET_CRITICAL_PERCENT: 85,
      AI_BUDGET_EXHAUSTED_PERCENT: 95,
    });
    expect(result.error).toBeUndefined();
  });
});
