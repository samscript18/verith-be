import { ConfigService } from '@nestjs/config';
import Joi from 'joi';
import type { Model } from 'mongoose';
import { ExternalProviderException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiFailureClass } from '../enums/ai-failure-class.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type { AiProvider } from '../interfaces/ai-provider.interface';
import type { ProviderExecution } from '../schemas/provider-execution.schema';
import { AiRouterService } from './ai-router.service';

describe('AiRouterService reliability routing', () => {
  it('uses a low-cost claim provider before bounded funded fallbacks', async () => {
    const vertex = provider(
      AiProviderName.VERTEX,
      new ExternalProviderException(
        'Vertex returned invalid output',
        'VERTEX_INVALID_JSON',
      ),
    );
    const bedrock = provider(AiProviderName.BEDROCK, { value: 'claims' });
    const groq = provider(
      AiProviderName.GROQ,
      new ExternalProviderException(
        'Groq returned invalid output',
        'GROQ_INVALID_JSON',
      ),
    );
    const gemini = provider(AiProviderName.GEMINI, { value: 'direct' });
    const { router } = createRouter([groq, gemini, vertex, bedrock]);

    await expect(
      router.execute({
        ...request(AiCapability.CLAIM_EXTRACTION),
        maxOutputTokens: 6000,
      }),
    ).resolves.toMatchObject({
      provider: AiProviderName.BEDROCK,
      primaryProvider: AiProviderName.GROQ,
      fallbackUsed: true,
    });
    expect(vertex.executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 6000 }),
    );
    expect(bedrock.executeMock).toHaveBeenCalledTimes(1);
    expect(groq.executeMock).toHaveBeenCalledTimes(1);
    expect(gemini.executeMock).not.toHaveBeenCalled();
  });

  it('uses the third image provider only after the first two fail', async () => {
    const vertex = provider(
      AiProviderName.VERTEX,
      new ExternalProviderException('Vertex failed', 'VERTEX_UNAVAILABLE'),
    );
    const gemini = provider(
      AiProviderName.GEMINI,
      new ExternalProviderException('Gemini failed', 'GEMINI_UNAVAILABLE'),
    );
    const openRouter = provider(AiProviderName.OPENROUTER, {
      value: 'visible text',
    });
    const { router } = createRouter([vertex, gemini, openRouter]);

    await expect(
      router.execute(request(AiCapability.IMAGE_UNDERSTANDING)),
    ).resolves.toMatchObject({ provider: AiProviderName.OPENROUTER });
    expect(vertex.executeMock).toHaveBeenCalledTimes(1);
    expect(gemini.executeMock).toHaveBeenCalledTimes(1);
    expect(openRouter.executeMock).toHaveBeenCalledTimes(1);
  });

  it('removes an unavailable provider from later attempt windows while its circuit is open', async () => {
    const vertex = provider(
      AiProviderName.VERTEX,
      new ExternalProviderException('Vertex failed', 'VERTEX_UNAVAILABLE'),
    );
    const gemini = provider(AiProviderName.GEMINI, { value: 'direct' });
    const openRouter = provider(AiProviderName.OPENROUTER, { value: 'spare' });
    const { router } = createRouter([vertex, gemini, openRouter]);

    await router.execute(request(AiCapability.IMAGE_UNDERSTANDING));
    await expect(
      router.execute(request(AiCapability.IMAGE_UNDERSTANDING)),
    ).resolves.toMatchObject({
      provider: AiProviderName.GEMINI,
      primaryProvider: AiProviderName.GEMINI,
      fallbackUsed: false,
    });
    expect(vertex.executeMock).toHaveBeenCalledTimes(1);
    expect(gemini.executeMock).toHaveBeenCalledTimes(2);
  });

  it('uses Vertex first for evidence comparison when it succeeds', async () => {
    const vertex = provider(AiProviderName.VERTEX, { value: 'vertex' });
    const bedrock = provider(AiProviderName.BEDROCK, { value: 'bedrock' });
    const { router } = createRouter([vertex, bedrock]);

    await expect(router.execute(request())).resolves.toMatchObject({
      output: { value: 'vertex' },
      provider: AiProviderName.VERTEX,
      fallbackUsed: false,
    });
    expect(vertex.executeMock).toHaveBeenCalledTimes(1);
    expect(vertex.executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 10000 }),
    );
    expect(bedrock.executeMock).not.toHaveBeenCalled();
  });

  it('allows one exceptional tertiary evidence provider after both reliability providers fail', async () => {
    const vertex = provider(
      AiProviderName.VERTEX,
      new ExternalProviderException(
        'Vertex output was truncated',
        'VERTEX_OUTPUT_TRUNCATED',
      ),
    );
    const bedrock = provider(
      AiProviderName.BEDROCK,
      new ExternalProviderException(
        'Bedrock output was truncated',
        'BEDROCK_OUTPUT_TRUNCATED',
      ),
    );
    const gemini = provider(AiProviderName.GEMINI, { value: 'validated' });
    const openRouter = provider(AiProviderName.OPENROUTER, { value: 'unused' });
    const { router } = createRouter([vertex, bedrock, gemini, openRouter]);

    await expect(router.execute(request())).resolves.toMatchObject({
      provider: AiProviderName.GEMINI,
      fallbackUsed: true,
    });
    expect(vertex.executeMock).toHaveBeenCalledTimes(1);
    expect(bedrock.executeMock).toHaveBeenCalledTimes(1);
    expect(gemini.executeMock).toHaveBeenCalledTimes(1);
    expect(openRouter.executeMock).not.toHaveBeenCalled();
  });

  it.each([
    ['VERTEX_RATE_LIMITED', AiFailureClass.RATE_LIMIT],
    ['VERTEX_UNAVAILABLE', AiFailureClass.TEMPORARY],
    ['VERTEX_TIMEOUT', AiFailureClass.TEMPORARY],
    ['VERTEX_AUTHENTICATION_FAILED', AiFailureClass.AUTHENTICATION],
    ['VERTEX_INVALID_REQUEST', AiFailureClass.INVALID_REQUEST],
  ])(
    'falls back once from %s to Bedrock and records the classified failure',
    async (code, failureClass) => {
      const vertex = provider(
        AiProviderName.VERTEX,
        new ExternalProviderException('Vertex failed', code),
      );
      const bedrock = provider(AiProviderName.BEDROCK, { value: 'bedrock' });
      const { router, create } = createRouter([vertex, bedrock]);

      await expect(router.execute(request())).resolves.toMatchObject({
        output: { value: 'bedrock' },
        provider: AiProviderName.BEDROCK,
        primaryProvider: AiProviderName.VERTEX,
        fallbackUsed: true,
      });
      expect(vertex.executeMock).toHaveBeenCalledTimes(1);
      expect(bedrock.executeMock).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          safeFailureCode: code,
          failureClass,
          fallbackProvider: AiProviderName.BEDROCK,
        }),
      );
    },
  );

  it('uses an existing tertiary provider when Bedrock is unavailable and Vertex is not configured', async () => {
    const bedrock = provider(
      AiProviderName.BEDROCK,
      new ExternalProviderException('Bedrock failed', 'BEDROCK_UNAVAILABLE'),
    );
    const openRouter = provider(AiProviderName.OPENROUTER, {
      value: 'existing',
    });
    const { router } = createRouter([bedrock, openRouter]);

    await expect(router.execute(request())).resolves.toMatchObject({
      provider: AiProviderName.OPENROUTER,
      fallbackUsed: true,
    });
  });

  it('skips exhausted paid capacity and preserves a free-provider path', async () => {
    const vertex = provider(AiProviderName.VERTEX, { value: 'paid' });
    const bedrock = provider(AiProviderName.BEDROCK, { value: 'paid' });
    const openRouter = provider(AiProviderName.OPENROUTER, { value: 'free' });
    const { router } = createRouter(
      [vertex, bedrock, openRouter],
      (name) => ![AiProviderName.VERTEX, AiProviderName.BEDROCK].includes(name),
    );

    await expect(router.execute(request())).resolves.toMatchObject({
      output: { value: 'free' },
      provider: AiProviderName.OPENROUTER,
    });
    expect(vertex.executeMock).not.toHaveBeenCalled();
    expect(bedrock.executeMock).not.toHaveBeenCalled();
  });

  it('moves free capacity ahead of paid providers in conserve mode', async () => {
    const vertex = provider(AiProviderName.VERTEX, { value: 'paid' });
    const openRouter = provider(AiProviderName.OPENROUTER, { value: 'free' });
    const { router } = createRouter(
      [vertex, openRouter],
      () => true,
      'CONSERVE',
    );

    await expect(router.execute(request())).resolves.toMatchObject({
      provider: AiProviderName.OPENROUTER,
      primaryProvider: AiProviderName.OPENROUTER,
      fallbackUsed: false,
    });
    expect(openRouter.executeMock).toHaveBeenCalledTimes(1);
    expect(vertex.executeMock).not.toHaveBeenCalled();
  });

  it('does not cascade an expensive video request after the first provider fails', async () => {
    const vertex = provider(
      AiProviderName.VERTEX,
      new ExternalProviderException('Vertex failed', 'VERTEX_UNAVAILABLE'),
    );
    const gemini = provider(AiProviderName.GEMINI, { value: 'duplicate' });
    const { router } = createRouter([vertex, gemini]);

    await expect(
      router.execute(request(AiCapability.VIDEO_UNDERSTANDING)),
    ).rejects.toMatchObject({ code: 'VERTEX_UNAVAILABLE' });
    expect(vertex.executeMock).toHaveBeenCalledTimes(1);
    expect(gemini.executeMock).not.toHaveBeenCalled();
  });

  it('preserves the bounded 7,000-token video output budget', async () => {
    const vertex = provider(AiProviderName.VERTEX, { value: 'video' });
    const { router } = createRouter([vertex]);

    await router.execute({
      ...request(AiCapability.VIDEO_UNDERSTANDING),
      maxOutputTokens: 7000,
      reasoningEffort: 'none',
    });

    expect(vertex.executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 7000,
        reasoningEffort: 'none',
      }),
    );
  });

  it('preserves the bounded 8,000-token localization output budget', async () => {
    const vertex = provider(AiProviderName.VERTEX, { value: 'translated' });
    const { router } = createRouter([vertex]);

    await router.execute({
      ...request(AiCapability.TRANSLATION),
      maxOutputTokens: 8000,
    });

    expect(vertex.executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8000 }),
    );
  });
});

function createRouter(
  fixtures: ProviderFixture[],
  allowed: (provider: AiProviderName) => boolean = () => true,
  budgetMode: 'NORMAL' | 'CONSERVE' | 'CRITICAL' | 'EXHAUSTED' = 'NORMAL',
) {
  const create = jest.fn().mockResolvedValue({});
  const router = new AiRouterService(
    fixtures.map((fixture) => fixture.value),
    { create } as unknown as Model<ProviderExecution>,
    {
      resolvePublished: jest.fn().mockResolvedValue({
        version: 1,
        systemPrompt: 'System',
        userPromptTemplate: '{{content}}',
      }),
      render: jest.fn().mockReturnValue('input'),
    } as never,
    {
      get: jest.fn().mockResolvedValue({
        enabledProviders: Object.values(AiProviderName),
        defaultOrder: Object.values(AiProviderName),
      }),
    } as never,
    {
      allows: jest
        .fn()
        .mockImplementation((name: AiProviderName) =>
          Promise.resolve(allowed(name)),
        ),
      estimate: jest.fn().mockReturnValue({
        estimatedCostUsd: 0.01,
        costEstimateSource: 'CONFIGURED_PRICING',
      }),
      invalidate: jest.fn(),
      mode: jest.fn().mockResolvedValue(budgetMode),
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
        maxProviderCalls: 3,
        executionRetentionDays: 30,
        capabilityRoutes: {},
      },
    }),
  );
  return { router, create };
}

function request(capability = AiCapability.EVIDENCE_SYNTHESIS) {
  return {
    capability,
    promptKey: 'test',
    variables: { content: 'private' },
    outputSchemaName: 'test',
    outputSchemaVersion: '1',
    outputJsonSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    outputValidator: Joi.object({ value: Joi.string().required() }).required(),
    requestId: 'req-test',
  };
}

interface ProviderFixture {
  value: AiProvider;
  executeMock: jest.Mock;
}

function provider(name: AiProviderName, result: unknown): ProviderFixture {
  const executeMock = jest.fn().mockImplementation(() =>
    result instanceof ExternalProviderException
      ? Promise.reject(result)
      : Promise.resolve({
          output: result,
          model: `${name.toLowerCase()}-model`,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }),
  );
  return {
    executeMock,
    value: {
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
      execute: executeMock,
    },
  };
}
