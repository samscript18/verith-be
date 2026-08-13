import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AiConfig } from '../../../shared/config';
import { AiBudgetMode } from '../enums/ai-budget-mode.enum';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type { AiTokenUsage } from '../interfaces/ai-provider.interface';
import { ProviderExecution } from '../schemas/provider-execution.schema';
import { PAID_AI_PROVIDERS } from '../data/provider-routing';

export type CostEstimateSource = 'CONFIGURED_PRICING' | 'UNAVAILABLE';

export interface AiCostEstimate {
  estimatedCostUsd?: number;
  costEstimateSource: CostEstimateSource;
}

export interface ProviderBudgetSnapshot {
  provider: AiProviderName.VERTEX | AiProviderName.BEDROCK;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  utilizationPercent: number;
  mode: AiBudgetMode;
}

export interface AiBudgetSnapshot {
  enabled: boolean;
  mode: AiBudgetMode;
  reviewPeriodStart: Date;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  utilizationPercent: number;
  providers: ProviderBudgetSnapshot[];
  calculatedAt: Date;
}

@Injectable()
export class AiBudgetService {
  private readonly config: AiConfig;
  private cached: { expiresAt: number; value: AiBudgetSnapshot } | undefined;
  private pending: Promise<AiBudgetSnapshot> | undefined;

  constructor(
    @InjectModel(ProviderExecution.name)
    private readonly executions: Model<ProviderExecution>,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AiConfig>('ai');
  }

  estimate(
    provider: AiProviderName,
    model: string,
    usage: AiTokenUsage,
  ): AiCostEstimate {
    const pricing =
      this.config.budget.pricing[`${provider}:${model}`] ??
      this.config.budget.pricing[`${provider}:*`];
    if (!pricing)
      return {
        costEstimateSource: 'UNAVAILABLE',
      };
    const input = usage.inputTokens ?? 0;
    const output = (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0);
    return {
      estimatedCostUsd:
        (input * pricing.inputUsdPerMillion +
          output * pricing.outputUsdPerMillion) /
        1_000_000,
      costEstimateSource: 'CONFIGURED_PRICING',
    };
  }

  async snapshot(force = false): Promise<AiBudgetSnapshot> {
    if (!force && this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value;
    if (!force && this.pending) return this.pending;
    this.pending = this.calculateSnapshot();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  private async calculateSnapshot(): Promise<AiBudgetSnapshot> {
    const paidProviders = [AiProviderName.VERTEX, AiProviderName.BEDROCK];
    const groups = await this.executions.aggregate<{
      _id: AiProviderName;
      spentUsd: number;
    }>([
      {
        $match: {
          provider: { $in: paidProviders },
          createdAt: { $gte: this.config.budget.reviewPeriodStart },
        },
      },
      {
        $group: {
          _id: '$provider',
          spentUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
        },
      },
    ]);
    const spentFor = (provider: AiProviderName) =>
      groups.find((group) => group._id === provider)?.spentUsd ?? 0;
    const providers: ProviderBudgetSnapshot[] = [
      this.providerSnapshot(
        AiProviderName.VERTEX,
        spentFor(AiProviderName.VERTEX),
        this.config.budget.vertexBudgetUsd,
      ),
      this.providerSnapshot(
        AiProviderName.BEDROCK,
        spentFor(AiProviderName.BEDROCK),
        this.config.budget.bedrockBudgetUsd,
      ),
    ];
    const spentUsd = providers.reduce((sum, item) => sum + item.spentUsd, 0);
    const budgetUsd = this.config.budget.reviewBudgetUsd;
    const value: AiBudgetSnapshot = {
      enabled: this.config.budget.enabled,
      mode: this.config.budget.enabled
        ? this.modeFor(spentUsd, budgetUsd)
        : AiBudgetMode.NORMAL,
      reviewPeriodStart: this.config.budget.reviewPeriodStart,
      spentUsd,
      budgetUsd,
      remainingUsd: Math.max(0, budgetUsd - spentUsd),
      utilizationPercent: budgetUsd ? (spentUsd / budgetUsd) * 100 : 100,
      providers,
      calculatedAt: new Date(),
    };
    this.cached = {
      value,
      expiresAt: Date.now() + this.config.budget.cacheSeconds * 1000,
    };
    return value;
  }

  async allows(
    provider: AiProviderName,
    capability: AiCapability,
  ): Promise<boolean> {
    if (!this.config.budget.enabled) return true;
    const snapshot = await this.snapshot();
    if (
      capability === AiCapability.DAILY_CHALLENGE_GENERATION &&
      snapshot.mode !== AiBudgetMode.NORMAL
    )
      return false;
    if (!PAID_AI_PROVIDERS.has(provider)) return true;
    const providerMode = snapshot.providers.find(
      (item) => item.provider === provider,
    )?.mode;
    if (
      snapshot.mode === AiBudgetMode.EXHAUSTED ||
      providerMode === AiBudgetMode.EXHAUSTED
    )
      return false;
    if (
      capability === AiCapability.VIDEO_UNDERSTANDING &&
      snapshot.mode === AiBudgetMode.CRITICAL
    )
      return false;
    if (
      provider === AiProviderName.BEDROCK &&
      snapshot.mode === AiBudgetMode.CRITICAL &&
      ![
        AiCapability.EVIDENCE_SYNTHESIS,
        AiCapability.REPORT_GENERATION,
        AiCapability.TRANSLATION,
      ].includes(capability)
    )
      return false;
    return true;
  }

  async mode(): Promise<AiBudgetMode> {
    if (!this.config.budget.enabled) return AiBudgetMode.NORMAL;
    return (await this.snapshot()).mode;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  private providerSnapshot(
    provider: AiProviderName.VERTEX | AiProviderName.BEDROCK,
    spentUsd: number,
    budgetUsd: number,
  ): ProviderBudgetSnapshot {
    return {
      provider,
      spentUsd,
      budgetUsd,
      remainingUsd: Math.max(0, budgetUsd - spentUsd),
      utilizationPercent: budgetUsd ? (spentUsd / budgetUsd) * 100 : 100,
      mode: this.config.budget.enabled
        ? this.modeFor(spentUsd, budgetUsd)
        : AiBudgetMode.NORMAL,
    };
  }

  private modeFor(spentUsd: number, budgetUsd: number): AiBudgetMode {
    const percent = budgetUsd ? (spentUsd / budgetUsd) * 100 : 100;
    if (percent >= this.config.budget.exhaustedPercent)
      return AiBudgetMode.EXHAUSTED;
    if (percent >= this.config.budget.criticalPercent)
      return AiBudgetMode.CRITICAL;
    if (percent >= this.config.budget.conservePercent)
      return AiBudgetMode.CONSERVE;
    return AiBudgetMode.NORMAL;
  }
}
