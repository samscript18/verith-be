import { registerAs } from '@nestjs/config';

export interface AiProviderConfig {
  apiKey: string;
  apiKeys: string[];
  baseUrl: string;
  timeoutMs: number;
  models: Record<string, string>;
  textConcurrency: number;
  mediaConcurrency: number;
  credentialAttempts: number;
}

export interface VertexAiConfig {
  enabled: boolean;
  projectId: string;
  location: string;
  credentialsJson: string;
  timeoutMs: number;
  models: Record<string, string>;
  textConcurrency: number;
  mediaConcurrency: number;
}

export interface BedrockAiConfig {
  enabled: boolean;
  region: string;
  timeoutMs: number;
  models: Record<string, string>;
  textConcurrency: number;
}

export interface AiModelPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface AiBudgetConfig {
  enabled: boolean;
  reviewPeriodStart: Date;
  reviewBudgetUsd: number;
  vertexBudgetUsd: number;
  bedrockBudgetUsd: number;
  conservePercent: number;
  criticalPercent: number;
  exhaustedPercent: number;
  pricing: Record<string, AiModelPricing>;
  cacheSeconds: number;
}

export interface AiConcurrencyConfig {
  text: number;
  report: number;
  localization: number;
  media: number;
  audio: number;
  video: number;
}

export interface AiCircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  temporaryCooldownMs: number;
  rateLimitCooldownMs: number;
  authenticationCooldownMs: number;
  invalidRequestCooldownMs: number;
}

export interface AiConfig {
  maxRetries: number;
  maxProviderCalls: number;
  healthCacheSeconds: number;
  executionRetentionDays: number;
  capabilityRoutes: Record<string, string[]>;
  concurrency: AiConcurrencyConfig;
  circuitBreaker: AiCircuitBreakerConfig;
  budget: AiBudgetConfig;
  gemini: AiProviderConfig;
  groq: AiProviderConfig;
  openRouter: AiProviderConfig & { siteUrl: string; appName: string };
  vertex: VertexAiConfig;
  bedrock: BedrockAiConfig;
}

export const FREE_AI_MODELS = {
  gemini: 'gemini-3.5-flash',
  groq: 'openai/gpt-oss-120b',
  groqTranscription: 'whisper-large-v3-turbo',
  openRouterReasoning: 'nvidia/nemotron-3-super-120b-a12b:free',
  openRouterVision: 'google/gemma-4-26b-a4b-it:free',
} as const;

const providerKeys = (
  plural: string | undefined,
  singular: string | undefined,
) =>
  [
    ...new Set(
      (plural || singular || '')
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ].slice(0, 3);

const numberValue = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanValue = (name: string, fallback = false): boolean => {
  const value = process.env[name];
  return value === undefined ? fallback : value.toLowerCase() === 'true';
};

const jsonObject = <T>(name: string): Record<string, T> => {
  const value = process.env[name]?.trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
};

const modelMap = (prefix: 'VERTEX' | 'BEDROCK') => ({
  text: process.env[`${prefix}_MODEL_TEXT`] ?? '',
  reasoning: process.env[`${prefix}_MODEL_REASONING`] ?? '',
  localization: process.env[`${prefix}_MODEL_LOCALIZATION`] ?? '',
  vision: process.env[`${prefix}_MODEL_VISION`] ?? '',
  video: process.env[`${prefix}_MODEL_VIDEO`] ?? '',
});

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
    // Critical structured and media capabilities may use three sequential
    // providers. Video remains single-provider to avoid duplicate processing.
    maxProviderCalls: 3,
    healthCacheSeconds: 300,
    executionRetentionDays: numberValue('AI_EXECUTION_RETENTION_DAYS', 120),
    capabilityRoutes: jsonObject<string[]>('AI_CAPABILITY_ROUTES_JSON'),
    concurrency: {
      text: numberValue('AI_TEXT_CONCURRENCY', 5),
      report: numberValue('AI_REPORT_CONCURRENCY', 2),
      localization: numberValue('AI_LOCALIZATION_CONCURRENCY', 2),
      media: numberValue('AI_MEDIA_CONCURRENCY', 2),
      audio: numberValue('AI_AUDIO_CONCURRENCY', 2),
      video: numberValue('AI_VIDEO_CONCURRENCY', 1),
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 1,
      temporaryCooldownMs: 60_000,
      rateLimitCooldownMs: 60_000,
      authenticationCooldownMs: 15 * 60_000,
      invalidRequestCooldownMs: 5 * 60_000,
    },
    budget: {
      enabled: booleanValue('AI_COST_GUARD_ENABLED'),
      reviewPeriodStart: new Date(
        process.env.AI_REVIEW_PERIOD_START ?? '2026-08-01T00:00:00.000Z',
      ),
      reviewBudgetUsd: numberValue('AI_REVIEW_BUDGET_USD', 250),
      vertexBudgetUsd: numberValue('VERTEX_REVIEW_BUDGET_USD', 220),
      bedrockBudgetUsd: numberValue('BEDROCK_REVIEW_BUDGET_USD', 30),
      conservePercent: numberValue('AI_BUDGET_CONSERVE_PERCENT', 70),
      criticalPercent: numberValue('AI_BUDGET_CRITICAL_PERCENT', 85),
      exhaustedPercent: numberValue('AI_BUDGET_EXHAUSTED_PERCENT', 95),
      pricing: jsonObject<AiModelPricing>('AI_MODEL_PRICING_JSON'),
      cacheSeconds: numberValue('AI_BUDGET_CACHE_SECONDS', 30),
    },
    gemini: {
      apiKey: geminiKeys[0] ?? '',
      apiKeys: geminiKeys,
      baseUrl: 'https://generativelanguage.googleapis.com',
      timeoutMs: 120000,
      models: {
        text: FREE_AI_MODELS.gemini,
        vision: FREE_AI_MODELS.gemini,
      },
      textConcurrency: numberValue('GEMINI_DIRECT_CONCURRENCY', 2),
      mediaConcurrency: numberValue('GEMINI_DIRECT_MEDIA_CONCURRENCY', 1),
      credentialAttempts: 3,
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
      textConcurrency: numberValue('GROQ_CONCURRENCY', 4),
      mediaConcurrency: numberValue('GROQ_MEDIA_CONCURRENCY', 2),
      credentialAttempts: 3,
    },
    openRouter: {
      apiKey: openRouterKeys[0] ?? '',
      apiKeys: openRouterKeys,
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 45000,
      models: {
        reasoning: FREE_AI_MODELS.openRouterReasoning,
        report: FREE_AI_MODELS.openRouterReasoning,
        vision: FREE_AI_MODELS.openRouterVision,
      },
      textConcurrency: numberValue('OPENROUTER_CONCURRENCY', 2),
      mediaConcurrency: numberValue('OPENROUTER_MEDIA_CONCURRENCY', 1),
      credentialAttempts: 3,
      siteUrl: process.env.OPENROUTER_SITE_URL ?? '',
      appName: 'Verith',
    },
    vertex: {
      enabled: booleanValue('VERTEX_AI_ENABLED'),
      projectId: process.env.VERTEX_PROJECT_ID ?? '',
      location: process.env.VERTEX_LOCATION ?? '',
      credentialsJson: process.env.GOOGLE_CLOUD_CREDENTIALS_JSON ?? '',
      timeoutMs: numberValue('VERTEX_TIMEOUT_MS', 120000),
      models: modelMap('VERTEX'),
      textConcurrency: numberValue('VERTEX_TEXT_CONCURRENCY', 4),
      mediaConcurrency: numberValue('VERTEX_MEDIA_CONCURRENCY', 2),
    },
    bedrock: {
      enabled: booleanValue('BEDROCK_ENABLED'),
      region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? '',
      timeoutMs: numberValue('BEDROCK_TIMEOUT_MS', 90000),
      models: modelMap('BEDROCK'),
      textConcurrency: numberValue('BEDROCK_TEXT_CONCURRENCY', 2),
    },
  };
});
