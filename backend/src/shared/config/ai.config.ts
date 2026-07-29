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

export const FREE_AI_MODELS = {
  gemini: 'gemini-3.5-flash',
  groq: 'openai/gpt-oss-120b',
  groqTranscription: 'whisper-large-v3-turbo',
  openRouter: 'openrouter/free',
} as const;

export default registerAs('ai', (): AiConfig => ({
  maxRetries: 2,
  healthCacheSeconds: 300,
  executionRetentionDays: 30,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    timeoutMs: 30000,
    models: {
      text: FREE_AI_MODELS.gemini,
      vision: FREE_AI_MODELS.gemini,
    },
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? '',
    baseUrl: 'https://api.groq.com/openai/v1',
    timeoutMs: 30000,
    models: {
      text: FREE_AI_MODELS.groq,
      transcription: FREE_AI_MODELS.groqTranscription,
    },
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseUrl: 'https://openrouter.ai/api/v1',
    timeoutMs: 45000,
    models: {
      reasoning: FREE_AI_MODELS.openRouter,
      report: FREE_AI_MODELS.openRouter,
    },
    siteUrl: process.env.OPENROUTER_SITE_URL ?? '',
    appName: 'Verith',
  },
}));
