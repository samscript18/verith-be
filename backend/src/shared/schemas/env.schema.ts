import Joi from 'joi';

const optionalSecret = Joi.string().trim().allow('').optional();

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_NAME: Joi.string().trim().default('Verith'),
  APP_HOST: Joi.string().hostname().default('0.0.0.0'),
  PORT: Joi.number().port().default(4000),
  API_PREFIX: Joi.string()
    .pattern(/^[a-z0-9/-]+$/)
    .default('api/v1'),
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
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  MONGODB_DB_NAME: Joi.string().trim().default('verith'),
  MONGODB_MAX_POOL_SIZE: Joi.number().integer().min(1).default(20),
  MONGODB_MIN_POOL_SIZE: Joi.number().integer().min(0).default(2),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .default(10000),
  MONGODB_SOCKET_TIMEOUT_MS: Joi.number().integer().min(1000).default(45000),
  MONGODB_AUTO_INDEX: Joi.boolean().truthy('true').falsy('false').default(true),

  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  REDIS_PREFIX: Joi.string().trim().default('verith'),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: optionalSecret,
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: Joi.number().integer().min(1).max(365).default(30),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: Joi.number()
    .integer()
    .min(5)
    .default(30),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: Joi.number().integer().min(5).default(20),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  MASTER_ENCRYPTION_KEY: optionalSecret,
  HASHING_PEPPER: Joi.string().min(32).required(),
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,
  CLOUDINARY_UPLOAD_FOLDER: Joi.string().trim().default('verith'),
  MAX_IMAGE_UPLOAD_BYTES: Joi.number().integer().min(1024).default(10485760),
  MAX_AUDIO_UPLOAD_BYTES: Joi.number().integer().min(1024).default(26214400),
  UPLOAD_PENDING_TTL_MINUTES: Joi.number().integer().min(5).default(60),
  MAIL_PROVIDER: optionalSecret,
  MAIL_HOST: optionalSecret,
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_USER: optionalSecret,
  MAIL_PASSWORD: optionalSecret,
  MAIL_FROM_NAME: Joi.string().default('Verith'),
  MAIL_FROM_EMAIL: Joi.string().email().allow('').optional(),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://generativelanguage.googleapis.com'),
  GEMINI_TEXT_MODEL: Joi.string().trim().allow('').optional(),
  GEMINI_VISION_MODEL: Joi.string().trim().allow('').optional(),
  GEMINI_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(120000)
    .default(30000),
  GROQ_API_KEY: optionalSecret,
  GROQ_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://api.groq.com/openai/v1'),
  GROQ_TEXT_MODEL: Joi.string().trim().allow('').optional(),
  GROQ_TRANSCRIPTION_MODEL: Joi.string().trim().allow('').optional(),
  GROQ_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://openrouter.ai/api/v1'),
  OPENROUTER_REASONING_MODEL: Joi.string().trim().allow('').optional(),
  OPENROUTER_REPORT_MODEL: Joi.string().trim().allow('').optional(),
  OPENROUTER_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(120000)
    .default(45000),
  OPENROUTER_SITE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
  OPENROUTER_APP_NAME: Joi.string().trim().default('Verith'),
  TAVILY_API_KEY: optionalSecret,
  AI_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  PROVIDER_HEALTH_CACHE_SECONDS: Joi.number()
    .integer()
    .min(5)
    .max(3600)
    .default(300),
  PROVIDER_EXECUTION_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(30),
  WHATSAPP_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', {
      is: true,
      then: Joi.required(),
    }),
  WHATSAPP_BUSINESS_ACCOUNT_ID: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.required() }),
  WHATSAPP_ACCESS_TOKEN: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', {
      is: true,
      then: Joi.required(),
    }),
  WHATSAPP_APP_SECRET: Joi.string().trim().allow('').when('WHATSAPP_ENABLED', {
    is: true,
    then: Joi.required(),
  }),
  WHATSAPP_VERIFY_TOKEN: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', {
      is: true,
      then: Joi.required(),
    }),
})
  .and('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
  .unknown(true);
