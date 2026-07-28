import { registerAs } from '@nestjs/config';

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  models: Record<string, string>;
}

export interface AiConfig {
  maxRetries: number;
  healthCacheSeconds: number;
  executionRetentionDays: number;
  gemini: AiProviderConfig;
  groq: AiProviderConfig;
  openRouter: AiProviderConfig & { siteUrl: string; appName: string };
}

export default registerAs('ai', (): AiConfig => ({
  maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
  healthCacheSeconds: Number(process.env.PROVIDER_HEALTH_CACHE_SECONDS ?? 300),
  executionRetentionDays: Number(
    process.env.PROVIDER_EXECUTION_RETENTION_DAYS ?? 30,
  ),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    baseUrl:
      process.env.GEMINI_BASE_URL ??
      'https://generativelanguage.googleapis.com',
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 30000),
    models: {
      text: process.env.GEMINI_TEXT_MODEL ?? '',
      vision: process.env.GEMINI_VISION_MODEL ?? '',
    },
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? '',
    baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    timeoutMs: Number(process.env.GROQ_TIMEOUT_MS ?? 30000),
    models: {
      text: process.env.GROQ_TEXT_MODEL ?? '',
      transcription: process.env.GROQ_TRANSCRIPTION_MODEL ?? '',
    },
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 45000),
    models: {
      reasoning: process.env.OPENROUTER_REASONING_MODEL ?? '',
      report: process.env.OPENROUTER_REPORT_MODEL ?? '',
    },
    siteUrl: process.env.OPENROUTER_SITE_URL ?? '',
    appName: process.env.OPENROUTER_APP_NAME ?? 'Verith',
  },
}));
