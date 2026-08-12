import Joi from 'joi';

const optionalSecret = Joi.string().trim().allow('').optional();

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
  TAVILY_API_KEY: optionalSecret,
  TAVILY_API_KEYS: optionalSecret,
  TAVILY_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
})
  .custom(validateDeploymentTopology)
  .messages({
    'deployment.distributedThrottlerRequired':
      'THROTTLER_STORAGE must be redis when API_REPLICA_COUNT is greater than 1',
  })
  .and('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
  .unknown(true);
