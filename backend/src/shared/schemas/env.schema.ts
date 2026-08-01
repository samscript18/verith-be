import Joi from 'joi';

const optionalSecret = Joi.string().trim().allow('').optional();

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
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  PROCESS_ROLE: Joi.string()
    .valid('all', 'api', 'worker', 'scheduler')
    .optional(),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .default('mongodb://localhost:27017/verith'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  HASHING_PEPPER: Joi.string().min(32).required(),
  DATA_EXPORT_ENCRYPTION_KEY: Joi.string().min(32).required(),
  COOKIE_DOMAIN: Joi.string().trim().allow('').optional(),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  COOKIE_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default('lax'),
  MASTER_ENCRYPTION_KEY: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', {
      is: true,
      then: Joi.string().min(32).required(),
    }),

  CLOUDINARY_CLOUD_NAME: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.string().required() }),
  CLOUDINARY_API_KEY: Joi.string().trim().allow('').when('WHATSAPP_ENABLED', {
    is: true,
    then: Joi.string().required(),
  }),
  CLOUDINARY_API_SECRET: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.string().required() }),

  MAIL_HOST: optionalSecret,
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_USER: optionalSecret,
  MAIL_PASSWORD: optionalSecret,
  MAIL_FROM_EMAIL: Joi.string().email().allow('').optional(),

  GEMINI_API_KEY: optionalSecret,
  GROQ_API_KEY: optionalSecret,
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_SITE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
  TAVILY_API_KEY: optionalSecret,
  TAVILY_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),

  WHATSAPP_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.required() }),
  WHATSAPP_BUSINESS_ACCOUNT_ID: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.required() }),
  WHATSAPP_ACCESS_TOKEN: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.required() }),
  WHATSAPP_APP_SECRET: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.required() }),
  WHATSAPP_VERIFY_TOKEN: Joi.string()
    .trim()
    .allow('')
    .when('WHATSAPP_ENABLED', { is: true, then: Joi.required() }),
  WHATSAPP_REPORT_DEEP_LINK_BASE: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
})
  .and('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
  .unknown(true);
