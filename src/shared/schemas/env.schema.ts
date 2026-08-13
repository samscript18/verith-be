import Joi from 'joi';

const optionalSecret = Joi.string().trim().allow('').optional();
const optionalPositiveInteger = Joi.number().integer().min(1).optional();
const optionalJsonObject = Joi.string()
  .trim()
  .custom((value: string, helpers) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return helpers.error('object.base');
      return value;
    } catch {
      return helpers.error('string.json');
    }
  })
  .allow('')
  .optional();

function validateDeploymentTopology(
  value: Record<string, unknown>,
  helpers: Joi.CustomHelpers,
): Record<string, unknown> {
  if (
    Number(value.API_REPLICA_COUNT) > 1 &&
    value.THROTTLER_STORAGE !== 'redis'
  ) {
    return helpers.error(
      'deployment.distributedThrottlerRequired',
    ) as unknown as Record<string, unknown>;
  }
  return value;
}

function validateAiReliabilityConfig(
  value: Record<string, unknown>,
  helpers: Joi.CustomHelpers,
): Record<string, unknown> {
  if (
    value.VERTEX_AI_ENABLED === true &&
    (!value.VERTEX_PROJECT_ID ||
      !value.VERTEX_LOCATION ||
      !Object.entries(value).some(
        ([key, model]) => key.startsWith('VERTEX_MODEL_') && Boolean(model),
      ))
  )
    return helpers.error('ai.vertexConfiguration') as unknown as Record<
      string,
      unknown
    >;
  if (
    value.BEDROCK_ENABLED === true &&
    (!(value.BEDROCK_REGION || value.AWS_REGION) ||
      !Object.entries(value).some(
        ([key, model]) => key.startsWith('BEDROCK_MODEL_') && Boolean(model),
      ))
  )
    return helpers.error('ai.bedrockConfiguration') as unknown as Record<
      string,
      unknown
    >;
  const conserve = Number(value.AI_BUDGET_CONSERVE_PERCENT ?? 70);
  const critical = Number(value.AI_BUDGET_CRITICAL_PERCENT ?? 85);
  const exhausted = Number(value.AI_BUDGET_EXHAUSTED_PERCENT ?? 95);
  if (!(conserve < critical && critical < exhausted))
    return helpers.error('ai.budgetThresholdOrder') as unknown as Record<
      string,
      unknown
    >;
  if (value.AI_COST_GUARD_ENABLED === true) {
    if (!value.AI_MODEL_PRICING_JSON)
      return helpers.error('ai.pricingRequired') as unknown as Record<
        string,
        unknown
      >;
    const pricingValue = value.AI_MODEL_PRICING_JSON;
    if (typeof pricingValue !== 'string')
      return helpers.error('ai.pricingRequired') as unknown as Record<
        string,
        unknown
      >;
    const pricing = JSON.parse(pricingValue) as Record<
      string,
      { inputUsdPerMillion?: unknown; outputUsdPerMillion?: unknown }
    >;
    const validPrice = (entry: (typeof pricing)[string] | undefined) =>
      entry &&
      Number.isFinite(Number(entry.inputUsdPerMillion)) &&
      Number.isFinite(Number(entry.outputUsdPerMillion)) &&
      Number(entry.inputUsdPerMillion) >= 0 &&
      Number(entry.outputUsdPerMillion) >= 0 &&
      Number(entry.inputUsdPerMillion) + Number(entry.outputUsdPerMillion) > 0;
    const missingPrice = (provider: 'VERTEX' | 'BEDROCK') =>
      value[`${provider === 'VERTEX' ? 'VERTEX_AI' : 'BEDROCK'}_ENABLED`] ===
        true &&
      Object.entries(value)
        .filter(([key, model]) => key.startsWith(`${provider}_MODEL_`) && model)
        .some(
          ([, model]) =>
            !validPrice(pricing[`${provider}:${String(model)}`]) &&
            !validPrice(pricing[`${provider}:*`]),
        );
    if (missingPrice('VERTEX') || missingPrice('BEDROCK'))
      return helpers.error('ai.pricingIncomplete') as unknown as Record<
        string,
        unknown
      >;
  }
  return value;
}

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  APP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:4000'),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000'),
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('debug'),
  SWAGGER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.boolean().default(false),
      otherwise: Joi.boolean().default(true),
    }),
  PROCESS_ROLE: Joi.string()
    .valid('all', 'api', 'worker', 'scheduler')
    .optional(),
  API_REPLICA_COUNT: Joi.number().integer().min(1).default(1),
  THROTTLER_STORAGE: Joi.string().valid('redis', 'memory').default('memory'),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .default('mongodb://localhost:27017/verith'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  HASHING_PEPPER: Joi.string().min(32).required(),
  DATA_EXPORT_ENCRYPTION_KEY: Joi.string().min(32).required(),
  GOOGLE_CLIENT_ID: optionalSecret,
  COOKIE_DOMAIN: Joi.string().trim().allow('').optional(),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  COOKIE_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default('lax'),
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,

  MAIL_HOST: optionalSecret,
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_USER: optionalSecret,
  MAIL_PASSWORD: optionalSecret,
  MAIL_FROM_EMAIL: Joi.string().email().allow('').optional(),

  GEMINI_API_KEY: optionalSecret,
  GEMINI_API_KEYS: optionalSecret,
  GROQ_API_KEY: optionalSecret,
  GROQ_API_KEYS: optionalSecret,
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_API_KEYS: optionalSecret,
  OPENROUTER_SITE_URL: Joi.string()
    .trim()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
  VERTEX_AI_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  VERTEX_PROJECT_ID: Joi.string().trim().allow('').optional(),
  VERTEX_LOCATION: Joi.string().trim().allow('').optional(),
  GOOGLE_CLOUD_CREDENTIALS_JSON: optionalJsonObject,
  VERTEX_MODEL_TEXT: Joi.string().trim().allow('').optional(),
  VERTEX_MODEL_REASONING: Joi.string().trim().allow('').optional(),
  VERTEX_MODEL_LOCALIZATION: Joi.string().trim().allow('').optional(),
  VERTEX_MODEL_VISION: Joi.string().trim().allow('').optional(),
  VERTEX_MODEL_VIDEO: Joi.string().trim().allow('').optional(),
  VERTEX_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).optional(),
  VERTEX_TEXT_CONCURRENCY: optionalPositiveInteger,
  VERTEX_MEDIA_CONCURRENCY: optionalPositiveInteger,
  BEDROCK_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  BEDROCK_REGION: Joi.string().trim().allow('').optional(),
  AWS_REGION: Joi.string().trim().allow('').optional(),
  AWS_ACCESS_KEY_ID: optionalSecret,
  AWS_SECRET_ACCESS_KEY: optionalSecret,
  AWS_SESSION_TOKEN: optionalSecret,
  BEDROCK_MODEL_TEXT: Joi.string().trim().allow('').optional(),
  BEDROCK_MODEL_REASONING: Joi.string().trim().allow('').optional(),
  BEDROCK_MODEL_LOCALIZATION: Joi.string().trim().allow('').optional(),
  BEDROCK_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).optional(),
  BEDROCK_TEXT_CONCURRENCY: optionalPositiveInteger,
  GEMINI_DIRECT_CONCURRENCY: optionalPositiveInteger,
  GEMINI_DIRECT_MEDIA_CONCURRENCY: optionalPositiveInteger,
  GROQ_CONCURRENCY: optionalPositiveInteger,
  GROQ_MEDIA_CONCURRENCY: optionalPositiveInteger,
  OPENROUTER_CONCURRENCY: optionalPositiveInteger,
  OPENROUTER_MEDIA_CONCURRENCY: optionalPositiveInteger,
  AI_TEXT_CONCURRENCY: optionalPositiveInteger,
  AI_REPORT_CONCURRENCY: optionalPositiveInteger,
  AI_LOCALIZATION_CONCURRENCY: optionalPositiveInteger,
  AI_MEDIA_CONCURRENCY: optionalPositiveInteger,
  AI_AUDIO_CONCURRENCY: optionalPositiveInteger,
  AI_VIDEO_CONCURRENCY: optionalPositiveInteger,
  AI_CAPABILITY_ROUTES_JSON: optionalJsonObject,
  AI_COST_GUARD_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  AI_REVIEW_PERIOD_START: Joi.date().iso().optional(),
  AI_REVIEW_BUDGET_USD: Joi.number().positive().optional(),
  VERTEX_REVIEW_BUDGET_USD: Joi.number().positive().optional(),
  BEDROCK_REVIEW_BUDGET_USD: Joi.number().positive().optional(),
  AI_BUDGET_CONSERVE_PERCENT: Joi.number().min(1).max(99).optional(),
  AI_BUDGET_CRITICAL_PERCENT: Joi.number().min(1).max(99).optional(),
  AI_BUDGET_EXHAUSTED_PERCENT: Joi.number().min(1).max(100).optional(),
  AI_BUDGET_CACHE_SECONDS: Joi.number().integer().min(5).max(300).optional(),
  AI_EXECUTION_RETENTION_DAYS: Joi.number()
    .integer()
    .min(30)
    .max(365)
    .optional(),
  AI_MODEL_PRICING_JSON: optionalJsonObject,
  TAVILY_API_KEY: optionalSecret,
  TAVILY_API_KEYS: optionalSecret,
  TAVILY_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
})
  .custom(validateDeploymentTopology)
  .custom(validateAiReliabilityConfig)
  .messages({
    'deployment.distributedThrottlerRequired':
      'THROTTLER_STORAGE must be redis when API_REPLICA_COUNT is greater than 1',
    'ai.vertexConfiguration':
      'VERTEX_AI_ENABLED requires VERTEX_PROJECT_ID, VERTEX_LOCATION, and at least one VERTEX_MODEL_* value',
    'ai.bedrockConfiguration':
      'BEDROCK_ENABLED requires BEDROCK_REGION (or AWS_REGION) and at least one BEDROCK_MODEL_* value',
    'ai.budgetThresholdOrder':
      'AI budget percentages must increase in CONSERVE < CRITICAL < EXHAUSTED order',
    'ai.pricingRequired':
      'AI_MODEL_PRICING_JSON is required when AI_COST_GUARD_ENABLED is true',
    'ai.pricingIncomplete':
      'AI_MODEL_PRICING_JSON must contain a non-zero valid price for every enabled Vertex and Bedrock model',
  })
  .and('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
  .unknown(true);
