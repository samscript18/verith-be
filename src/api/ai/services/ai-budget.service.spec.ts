import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { AiBudgetMode } from '../enums/ai-budget-mode.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type { ProviderExecution } from '../schemas/provider-execution.schema';
import { AiBudgetService } from './ai-budget.service';

describe('AiBudgetService', () => {
  it('estimates model-aware cost from recorded token usage', () => {
    const service = createService([]);
    expect(
      service.estimate(AiProviderName.VERTEX, 'vertex-reasoning', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      }),
    ).toEqual({
      estimatedCostUsd: 4,
      costEstimateSource: 'CONFIGURED_PRICING',
    });
  });

  it('includes provider-reported reasoning tokens in paid output cost', () => {
    const service = createService([]);
    expect(
      service.estimate(AiProviderName.VERTEX, 'vertex-reasoning', {
        inputTokens: 1_000_000,
        outputTokens: 250_000,
        reasoningTokens: 250_000,
      }),
    ).toEqual({
      estimatedCostUsd: 4,
      costEstimateSource: 'CONFIGURED_PRICING',
    });
  });

  it('moves through configured review-period budget modes', async () => {
    const conserve = createService([
      { _id: AiProviderName.VERTEX, spentUsd: 180 },
    ]);
    await expect(conserve.snapshot()).resolves.toMatchObject({
      mode: AiBudgetMode.CONSERVE,
      spentUsd: 180,
    });

    const critical = createService([
      { _id: AiProviderName.VERTEX, spentUsd: 220 },
    ]);
    await expect(critical.snapshot()).resolves.toMatchObject({
      mode: AiBudgetMode.CRITICAL,
    });

    const exhausted = createService([
      { _id: AiProviderName.VERTEX, spentUsd: 240 },
    ]);
    await expect(exhausted.snapshot()).resolves.toMatchObject({
      mode: AiBudgetMode.EXHAUSTED,
    });
  });

  it('disables paid Daily Practice in conserve mode and all paid calls when exhausted', async () => {
    const conserve = createService([
      { _id: AiProviderName.VERTEX, spentUsd: 180 },
    ]);
    await expect(
      conserve.allows(
        AiProviderName.VERTEX,
        AiCapability.DAILY_CHALLENGE_GENERATION,
      ),
    ).resolves.toBe(false);
    await expect(
      conserve.allows(
        AiProviderName.GROQ,
        AiCapability.DAILY_CHALLENGE_GENERATION,
      ),
    ).resolves.toBe(false);
    await expect(
      conserve.allows(AiProviderName.VERTEX, AiCapability.REPORT_GENERATION),
    ).resolves.toBe(true);

    const critical = createService([
      { _id: AiProviderName.VERTEX, spentUsd: 220 },
    ]);
    await expect(
      critical.allows(
        AiProviderName.GROQ,
        AiCapability.DAILY_CHALLENGE_GENERATION,
      ),
    ).resolves.toBe(false);

    const exhausted = createService([
      { _id: AiProviderName.VERTEX, spentUsd: 240 },
    ]);
    await expect(
      exhausted.allows(AiProviderName.VERTEX, AiCapability.REPORT_GENERATION),
    ).resolves.toBe(false);
    await expect(
      exhausted.allows(AiProviderName.GROQ, AiCapability.REPORT_GENERATION),
    ).resolves.toBe(true);
  });
});

function createService(
  groups: Array<{ _id: AiProviderName; spentUsd: number }>,
) {
  return new AiBudgetService(
    {
      aggregate: jest.fn().mockResolvedValue(groups),
    } as unknown as Model<ProviderExecution>,
    new ConfigService({
      ai: {
        budget: {
          enabled: true,
          reviewPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
          reviewBudgetUsd: 250,
          vertexBudgetUsd: 250,
          bedrockBudgetUsd: 100,
          conservePercent: 70,
          criticalPercent: 85,
          exhaustedPercent: 95,
          cacheSeconds: 30,
          pricing: {
            'VERTEX:vertex-reasoning': {
              inputUsdPerMillion: 1,
              outputUsdPerMillion: 6,
            },
          },
        },
      },
    }),
  );
}
