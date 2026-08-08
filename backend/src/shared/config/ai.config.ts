import { registerAs } from '@nestjs/config';

export interface AiProviderConfig {
  apiKey: string;
  apiKeys: string[];
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

const providerKeys = (
  plural: string | undefined,
  singular: string | undefined,
) => [
  ...new Set(
    (plural || singular || '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean),
  ),
];

export default registerAs('ai', (): AiConfig => {
  const geminiKeys = providerKeys(
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY,
  );
  const groqKeys = providerKeys(
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
  );
  const openRouterKeys = providerKeys(
    process.env.OPENROUTER_API_KEYS,
    process.env.OPENROUTER_API_KEY,
  );
  return {
    maxRetries: 1,
    healthCacheSeconds: 300,
    executionRetentionDays: 30,
    gemini: {
      apiKey: geminiKeys[0] ?? '',
      apiKeys: geminiKeys,
      baseUrl: 'https://generativelanguage.googleapis.com',
      timeoutMs: 120000,
      models: {
        text: FREE_AI_MODELS.gemini,
        vision: FREE_AI_MODELS.gemini,
      },
    },
    groq: {
      apiKey: groqKeys[0] ?? '',
      apiKeys: groqKeys,
      baseUrl: 'https://api.groq.com/openai/v1',
      timeoutMs: 30000,
      models: {
        text: FREE_AI_MODELS.groq,
        transcription: FREE_AI_MODELS.groqTranscription,
      },
    },
    openRouter: {
      apiKey: openRouterKeys[0] ?? '',
      apiKeys: openRouterKeys,
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 45000,
      models: {
        reasoning: FREE_AI_MODELS.openRouter,
        report: FREE_AI_MODELS.openRouter,
      },
      siteUrl: process.env.OPENROUTER_SITE_URL ?? '',
      appName: 'Verith',
    },
  };
});
