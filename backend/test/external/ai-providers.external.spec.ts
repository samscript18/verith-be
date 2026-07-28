import { ConfigService } from '@nestjs/config';
import { AiCapability } from '../../src/api/ai/enums/ai-capability.enum';
import type { AiProvider } from '../../src/api/ai/interfaces/ai-provider.interface';
import { GeminiProvider } from '../../src/api/ai/providers/gemini.provider';
import { GroqProvider } from '../../src/api/ai/providers/groq.provider';
import { OpenRouterProvider } from '../../src/api/ai/providers/openrouter.provider';
import type { AiConfig } from '../../src/shared/config';
import { ProviderState } from '../../src/shared/enums/provider-state.enum';

const run = process.env.RUN_AI_EXTERNAL_TESTS === 'true';

(run ? describe : describe.skip)('AI providers (external contract)', () => {
  jest.setTimeout(120000);

  it('returns schema-valid JSON from every configured provider', async () => {
    const providers = configuredProviders();
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      const model = provider.modelFor(AiCapability.STRUCTURED_EXTRACTION);
      expect(model).toBeTruthy();
      const health = await provider.healthCheck();
      expect(health.state).toBe(ProviderState.OPERATIONAL);
      const result = await provider.execute({
        capability: AiCapability.STRUCTURED_EXTRACTION,
        model: model!,
        systemPrompt: 'Return only the requested structured JSON.',
        userPrompt: 'Set ok to true.',
        outputSchemaName: 'provider_contract',
        outputJsonSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false,
        },
        temperature: 0.1,
        maxOutputTokens: 32,
      });
      expect(result.output).toEqual({ ok: true });
    }
  });
});

function configuredProviders(): AiProvider[] {
  const config = aiConfig();
  const service = new ConfigService({ ai: config });
  return [
    new GeminiProvider(service),
    new GroqProvider(service),
    new OpenRouterProvider(service),
  ].filter((provider) => provider.configured);
}

function aiConfig(): AiConfig {
  return {
    maxRetries: 0,
    healthCacheSeconds: 5,
    executionRetentionDays: 1,
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      baseUrl:
        process.env.GEMINI_BASE_URL ??
        'https://generativelanguage.googleapis.com',
      timeoutMs: 60000,
      models: {
        text: process.env.GEMINI_TEXT_MODEL ?? '',
        vision: process.env.GEMINI_VISION_MODEL ?? '',
      },
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY ?? '',
      baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
      timeoutMs: 60000,
      models: {
        text: process.env.GROQ_TEXT_MODEL ?? '',
        transcription: process.env.GROQ_TRANSCRIPTION_MODEL ?? '',
      },
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseUrl:
        process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      timeoutMs: 60000,
      models: {
        reasoning: process.env.OPENROUTER_REASONING_MODEL ?? '',
        report: process.env.OPENROUTER_REPORT_MODEL ?? '',
      },
      siteUrl: process.env.OPENROUTER_SITE_URL ?? '',
      appName: process.env.OPENROUTER_APP_NAME ?? 'Verith',
    },
  };
}
