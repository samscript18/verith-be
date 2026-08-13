import { ConfigService } from '@nestjs/config';
import Joi from 'joi';
import type { Model } from 'mongoose';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type { AiProvider } from '../interfaces/ai-provider.interface';
import type { ProviderExecution } from '../schemas/provider-execution.schema';
import { AiRouterService } from './ai-router.service';
import { PromptRegistryService } from './prompt-registry.service';

describe('AiRouterService', () => {
  it('records invalid primary output and returns an explicit fallback', async () => {
    const primary = provider(AiProviderName.GROQ, { wrong: true });
    const fallback = provider(AiProviderName.OPENROUTER, { value: 'valid' });
    const create = jest.fn().mockResolvedValue({});
    const prompts = {
      resolvePublished: jest.fn().mockResolvedValue({
        version: 2,
        systemPrompt: 'System',
        userPromptTemplate: '{{content}}',
      }),
      render: jest.fn().mockReturnValue('input'),
    };
    const router = new AiRouterService(
      [primary, fallback],
      { create } as unknown as Model<ProviderExecution>,
      prompts as unknown as PromptRegistryService,
      {
        get: jest.fn().mockResolvedValue({
          enabledProviders: [
            AiProviderName.GROQ,
            AiProviderName.OPENROUTER,
            AiProviderName.GEMINI,
          ],
          defaultOrder: [
            AiProviderName.GROQ,
            AiProviderName.OPENROUTER,
            AiProviderName.GEMINI,
          ],
        }),
      } as never,
      {
        allows: jest.fn().mockResolvedValue(true),
        estimate: jest.fn().mockReturnValue({
          costEstimateSource: 'UNAVAILABLE',
        }),
        invalidate: jest.fn(),
        mode: jest.fn().mockResolvedValue('NORMAL'),
      } as never,
      {
        run: jest.fn(
          (_provider: unknown, _capability: unknown, execute: () => unknown) =>
            execute(),
        ),
      } as never,
      new ConfigService({
        ai: {
          maxRetries: 0,
          maxProviderCalls: 2,
          healthCacheSeconds: 300,
          executionRetentionDays: 30,
          capabilityRoutes: {},
        },
      }),
    );

    const result = await router.execute({
      capability: AiCapability.STRUCTURED_EXTRACTION,
      promptKey: 'test',
      variables: { content: 'private input' },
      outputSchemaName: 'test',
      outputSchemaVersion: '1',
      outputJsonSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      outputValidator: Joi.object({
        value: Joi.string().required(),
      }).required(),
      requestId: 'req-test',
    });

    expect(result).toMatchObject({
      output: { value: 'valid' },
      provider: AiProviderName.OPENROUTER,
      primaryProvider: AiProviderName.GROQ,
      fallbackUsed: true,
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(create.mock.calls)).not.toContain('private input');
  });
});

function provider(name: AiProviderName, output: unknown): AiProvider {
  return {
    provider: name,
    configured: true,
    supports: () => true,
    modelFor: () => `${name.toLowerCase()}-model`,
    healthCheck: () =>
      Promise.resolve({
        provider: name,
        state: ProviderState.OPERATIONAL,
        checkedAt: new Date(),
        latencyMs: 1,
      }),
    execute: () =>
      Promise.resolve({
        output,
        model: `${name.toLowerCase()}-model`,
        usage: { totalTokens: 5 },
      }),
  };
}
