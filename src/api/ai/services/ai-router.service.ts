import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import {
  ExternalProviderException,
  NotFoundException,
} from '../../../core/exceptions';
import type { AiConfig } from '../../../shared/config';
import {
  DEFAULT_CAPABILITY_ROUTES,
  defaultMaxOutputTokens,
  maxProviderCallsFor,
} from '../data/provider-routing';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiBudgetMode } from '../enums/ai-budget-mode.enum';
import {
  AiFailureClass,
  classifyAiFailure,
} from '../enums/ai-failure-class.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type { AiProvider } from '../interfaces/ai-provider.interface';
import { AI_PROVIDERS } from '../interfaces/ai-provider.interface';
import type {
  AiRouterRequest,
  AiRouterResult,
} from '../interfaces/ai-router.interface';
import { ProviderExecution } from '../schemas/provider-execution.schema';
import { AiBudgetService } from './ai-budget.service';
import { AiConcurrencyService } from './ai-concurrency.service';
import { PromptRegistryService } from './prompt-registry.service';
import { ProviderConfigService } from './provider-config.service';

@Injectable()
export class AiRouterService {
  private readonly config: AiConfig;
  private readonly logger = new Logger(AiRouterService.name);

  constructor(
    @Inject(AI_PROVIDERS) private readonly providers: AiProvider[],
    @InjectModel(ProviderExecution.name)
    private readonly executionModel: Model<ProviderExecution>,
    private readonly prompts: PromptRegistryService,
    private readonly providerConfig: ProviderConfigService,
    private readonly budget: AiBudgetService,
    private readonly concurrency: AiConcurrencyService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AiConfig>('ai');
  }

  async execute<TOutput>(
    request: AiRouterRequest<TOutput>,
  ): Promise<AiRouterResult<TOutput>> {
    const candidates = await this.candidates(
      request.capability,
      request.preferredProvider,
    );
    if (!candidates.length)
      throw new ExternalProviderException(
        'No configured and budget-eligible AI provider supports this capability',
        'AI_PROVIDER_NOT_CONFIGURED',
      );

    const primaryProvider = candidates[0]!.provider;
    const maximumCalls = Math.min(
      this.config.maxProviderCalls,
      maxProviderCallsFor(request.capability),
      Math.max(1, request.maxProviderCalls ?? this.config.maxProviderCalls),
      candidates.length,
    );
    const selected = candidates.slice(0, maximumCalls);
    const maxOutputTokens = Math.min(
      request.maxOutputTokens ?? defaultMaxOutputTokens(request.capability),
      defaultMaxOutputTokens(request.capability),
    );
    let lastCode = 'AI_PROVIDER_UNAVAILABLE';
    let lastOperatorDetails: unknown = null;

    for (let index = 0; index < selected.length; index += 1) {
      const provider = selected[index]!;
      const fallbackProvider = selected[index + 1]?.provider;
      const model = provider.modelFor(request.capability);
      if (!model) continue;
      if (index > 0) {
        this.logger.warn({
          event: 'ai_provider_fallback_selected',
          requestId: request.requestId,
          verificationId: request.verificationId ?? null,
          capability: request.capability,
          primaryProvider,
          provider: provider.provider,
          attempt: index + 1,
          maximumCalls,
        });
      }
      let prompt;
      try {
        prompt = await this.prompts.resolvePublished(
          request.promptKey,
          provider.provider,
          model,
          request.outputSchemaVersion,
        );
      } catch (error) {
        if (error instanceof NotFoundException) {
          lastCode = error.code;
          continue;
        }
        throw error;
      }
      const userPrompt = this.prompts.render(
        prompt.userPromptTemplate,
        request.variables,
      );
      const startedAt = new Date();
      this.logger.log({
        event: 'ai_provider_attempt_started',
        requestId: request.requestId,
        verificationId: request.verificationId ?? null,
        capability: request.capability,
        provider: provider.provider,
        primaryProvider,
        model,
        promptKey: request.promptKey,
        promptVersion: prompt.version,
        outputSchemaVersion: request.outputSchemaVersion,
        attempt: index + 1,
        maximumCalls,
        maxOutputTokens,
      });
      try {
        const result = await this.concurrency.run(
          provider.provider,
          request.capability,
          () =>
            provider.execute({
              capability: request.capability,
              model,
              systemPrompt: prompt.systemPrompt,
              userPrompt,
              outputSchemaName: request.outputSchemaName,
              outputJsonSchema: request.outputJsonSchema,
              ...(request.temperature !== undefined
                ? { temperature: request.temperature }
                : {}),
              maxOutputTokens,
              ...(request.reasoningEffort
                ? { reasoningEffort: request.reasoningEffort }
                : {}),
              ...(request.media ? { media: request.media } : {}),
            }),
        );
        const validation = request.outputValidator.validate(result.output, {
          abortEarly: false,
          allowUnknown: false,
          stripUnknown: false,
        });
        if (validation.error) {
          lastCode = 'AI_OUTPUT_VALIDATION_FAILED';
          const measured = this.measuredUsage(
            result.usage,
            prompt.systemPrompt,
            userPrompt,
            result.output,
          );
          await this.record(request, {
            provider: provider.provider,
            primaryProvider,
            model: result.model,
            promptVersion: prompt.version,
            startedAt,
            success: false,
            safeFailureCode: lastCode,
            failureClass: AiFailureClass.INVALID_RESPONSE,
            attempt: index + 1,
            usage: measured.usage,
            tokenUsageSource: measured.source,
            ...(fallbackProvider ? { fallbackProvider } : {}),
            ...(result.providerRequestId
              ? { providerRequestId: result.providerRequestId }
              : {}),
          });
          this.logger.warn({
            event: 'ai_provider_output_validation_failed',
            requestId: request.requestId,
            verificationId: request.verificationId ?? null,
            capability: request.capability,
            provider: provider.provider,
            model: result.model,
            attempt: index + 1,
            latencyMs: Date.now() - startedAt.getTime(),
            validationIssueCount: validation.error.details.length,
            fallbackProvider: fallbackProvider ?? null,
            ...measured.usage,
          });
          continue;
        }
        const measured = this.measuredUsage(
          result.usage,
          prompt.systemPrompt,
          userPrompt,
          result.output,
        );
        await this.record(request, {
          provider: provider.provider,
          primaryProvider,
          model: result.model,
          promptVersion: prompt.version,
          startedAt,
          success: true,
          attempt: index + 1,
          usage: measured.usage,
          tokenUsageSource: measured.source,
          ...(result.providerRequestId
            ? { providerRequestId: result.providerRequestId }
            : {}),
        });
        this.logger.log({
          event: 'ai_provider_attempt_succeeded',
          requestId: request.requestId,
          verificationId: request.verificationId ?? null,
          capability: request.capability,
          provider: provider.provider,
          primaryProvider,
          model: result.model,
          attempt: index + 1,
          latencyMs: Date.now() - startedAt.getTime(),
          fallbackUsed: provider.provider !== primaryProvider,
          providerRequestId: result.providerRequestId ?? null,
          tokenUsageSource: measured.source,
          ...measured.usage,
        });
        return {
          output: validation.value,
          provider: provider.provider,
          primaryProvider,
          fallbackUsed: provider.provider !== primaryProvider,
          model: result.model,
          promptVersion: prompt.version,
          usage: measured.usage,
        };
      } catch (error) {
        lastCode =
          error instanceof ExternalProviderException
            ? error.code
            : 'AI_PROVIDER_EXECUTION_FAILED';
        if (error instanceof ExternalProviderException)
          lastOperatorDetails = error.operatorDetails;
        const failureClass = classifyAiFailure(lastCode);
        const operatorMetadata = this.safeOperatorMetadata(error);
        await this.record(request, {
          provider: provider.provider,
          primaryProvider,
          model,
          promptVersion: prompt.version,
          startedAt,
          success: false,
          safeFailureCode: lastCode,
          failureClass,
          attempt: index + 1,
          usage: {
            ...(operatorMetadata.inputTokens !== undefined
              ? { inputTokens: operatorMetadata.inputTokens }
              : {}),
            ...(operatorMetadata.outputTokens !== undefined
              ? { outputTokens: operatorMetadata.outputTokens }
              : {}),
            ...(operatorMetadata.reasoningTokens !== undefined
              ? { reasoningTokens: operatorMetadata.reasoningTokens }
              : {}),
            ...(operatorMetadata.totalTokens !== undefined
              ? { totalTokens: operatorMetadata.totalTokens }
              : {}),
          },
          tokenUsageSource:
            operatorMetadata.inputTokens !== undefined ||
            operatorMetadata.outputTokens !== undefined
              ? 'PROVIDER_REPORTED'
              : 'UNAVAILABLE',
          ...(operatorMetadata.providerRequestId
            ? { providerRequestId: operatorMetadata.providerRequestId }
            : {}),
          ...(fallbackProvider ? { fallbackProvider } : {}),
        });
        const failureLog = {
          event: 'ai_provider_attempt_failed',
          requestId: request.requestId,
          verificationId: request.verificationId ?? null,
          capability: request.capability,
          provider: provider.provider,
          primaryProvider,
          model,
          attempt: index + 1,
          latencyMs: Date.now() - startedAt.getTime(),
          failureCode: lastCode,
          failureClass,
          fallbackProvider: fallbackProvider ?? null,
          ...operatorMetadata,
        };
        if (
          [
            AiFailureClass.AUTHENTICATION,
            AiFailureClass.BILLING,
            AiFailureClass.INVALID_REQUEST,
            AiFailureClass.UNKNOWN,
          ].includes(failureClass)
        )
          this.logger.error(failureLog);
        else this.logger.warn(failureLog);
      }
    }
    this.logger.error({
      event: 'ai_capability_exhausted',
      requestId: request.requestId,
      verificationId: request.verificationId ?? null,
      capability: request.capability,
      primaryProvider,
      attemptedProviders: selected.map((provider) => provider.provider),
      attempts: selected.length,
      failureCode: lastCode,
    });
    throw new ExternalProviderException(
      'No AI provider produced a valid result',
      lastCode,
      undefined,
      null,
      lastOperatorDetails,
    );
  }

  private async candidates(
    capability: AiCapability,
    preferred?: AiProviderName,
  ): Promise<AiProvider[]> {
    const runtime = await this.providerConfig.get();
    const budgetMode = await this.budget.mode();
    const override = this.config.capabilityRoutes[capability];
    const route = override?.length
      ? override.filter((name): name is AiProviderName =>
          Object.values(AiProviderName).includes(name as AiProviderName),
        )
      : [...DEFAULT_CAPABILITY_ROUTES[capability]];
    const enabled = route.filter((provider) =>
      runtime.enabledProviders.includes(provider),
    );
    if (preferred && enabled.includes(preferred)) {
      const rest = enabled.filter((provider) => provider !== preferred);
      enabled.splice(0, enabled.length, preferred, ...rest);
    }
    if ([AiBudgetMode.CONSERVE, AiBudgetMode.CRITICAL].includes(budgetMode))
      enabled.sort(
        (left, right) => Number(this.isPaid(left)) - Number(this.isPaid(right)),
      );
    const allowed = await Promise.all(
      enabled.map(async (name) => ({
        name,
        allowed: await this.budget.allows(name, capability),
      })),
    );
    return allowed
      .filter((item) => item.allowed)
      .map((item) =>
        this.providers.find((provider) => provider.provider === item.name),
      )
      .filter((provider): provider is AiProvider =>
        Boolean(
          provider?.supports(capability) && provider.modelFor(capability),
        ),
      );
  }

  private isPaid(provider: AiProviderName): boolean {
    return [AiProviderName.VERTEX, AiProviderName.BEDROCK].includes(provider);
  }

  private async record<TOutput>(
    request: AiRouterRequest<TOutput>,
    data: {
      provider: AiProviderName;
      primaryProvider: AiProviderName;
      model: string;
      promptVersion: number;
      startedAt: Date;
      success: boolean;
      safeFailureCode?: string;
      failureClass?: AiFailureClass;
      fallbackProvider?: AiProviderName;
      attempt: number;
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        totalTokens?: number;
      };
      tokenUsageSource?:
        'PROVIDER_REPORTED' | 'CHARACTER_ESTIMATE' | 'UNAVAILABLE';
      providerRequestId?: string;
    },
  ): Promise<void> {
    const endedAt = new Date();
    const cost = this.budget.estimate(data.provider, data.model, data.usage);
    await this.executionModel.create({
      ...(request.verificationId
        ? { verificationId: new Types.ObjectId(request.verificationId) }
        : {}),
      requestId: request.requestId,
      provider: data.provider,
      primaryProvider: data.primaryProvider,
      capability: request.capability,
      model: data.model,
      promptKey: request.promptKey,
      promptVersion: data.promptVersion,
      outputSchemaVersion: request.outputSchemaVersion,
      inputFingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            variables: request.variables,
            ...(request.media
              ? {
                  mediaMimeType: request.media.mimeType,
                  mediaHash: createHash('sha256')
                    .update(request.media.base64Data)
                    .digest('hex'),
                }
              : {}),
          }),
        )
        .digest('hex'),
      startedAt: data.startedAt,
      endedAt,
      latencyMs: endedAt.getTime() - data.startedAt.getTime(),
      success: data.success,
      ...(data.safeFailureCode
        ? { safeFailureCode: data.safeFailureCode }
        : {}),
      ...(data.failureClass ? { failureClass: data.failureClass } : {}),
      ...(data.fallbackProvider
        ? { fallbackProvider: data.fallbackProvider }
        : {}),
      ...(data.providerRequestId
        ? { providerRequestId: data.providerRequestId }
        : {}),
      ...data.usage,
      tokenUsageSource: data.tokenUsageSource ?? 'UNAVAILABLE',
      ...cost,
      attempt: data.attempt,
      deleteAfter: new Date(
        Date.now() + this.config.executionRetentionDays * 86400000,
      ),
    });
    this.budget.invalidate();
  }

  private measuredUsage(
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    },
    systemPrompt: string,
    userPrompt: string,
    output: unknown,
  ) {
    if (usage.inputTokens !== undefined && usage.outputTokens !== undefined)
      return { usage, source: 'PROVIDER_REPORTED' as const };
    const inputTokens =
      usage.inputTokens ??
      Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    const outputTokens =
      usage.outputTokens ?? Math.ceil(JSON.stringify(output).length / 4);
    return {
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
      },
      source: 'CHARACTER_ESTIMATE' as const,
    };
  }

  private safeOperatorMetadata(error: unknown): {
    stopReason?: string;
    finishReason?: string;
    nativeFinishReason?: string;
    outputCharacters?: number;
    startsWithJsonContainer?: boolean;
    endsWithJsonContainer?: boolean;
    markdownFenceRemoved?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    httpStatus?: number;
    providerStatus?: string;
    providerMessage?: string;
    blockReason?: string;
    blockReasonMessage?: string;
    finishMessage?: string;
    responseId?: string;
    modelVersion?: string;
    mediaMimeType?: string;
    mediaBytes?: number;
    safetyRatingCount?: number;
    blockedSafetyRatingCount?: number;
    safetyCategories?: string;
    candidateCount?: number;
    partCount?: number;
    textPartCount?: number;
    thoughtPartCount?: number;
    providerRequestId?: string;
  } {
    if (!(error instanceof ExternalProviderException)) return {};
    const value = error.operatorDetails;
    if (typeof value !== 'object' || value === null) return {};
    const source = value as Record<string, unknown>;
    const text = (key: string, max: number) =>
      typeof source[key] === 'string' ? source[key].slice(0, max) : undefined;
    const number = (key: string) =>
      typeof source[key] === 'number' && Number.isFinite(source[key])
        ? source[key]
        : undefined;
    const boolean = (key: string) =>
      typeof source[key] === 'boolean' ? source[key] : undefined;
    const result: ReturnType<AiRouterService['safeOperatorMetadata']> = {};
    const stopReason = text('stopReason', 80);
    const finishReason = text('finishReason', 80);
    const nativeFinishReason = text('nativeFinishReason', 80);
    const providerRequestId = text('providerRequestId', 160);
    const providerStatus = text('providerStatus', 80);
    const providerMessage = text('providerMessage', 500);
    const blockReason = text('blockReason', 80);
    const blockReasonMessage = text('blockReasonMessage', 500);
    const finishMessage = text('finishMessage', 500);
    const responseId = text('responseId', 160);
    const modelVersion = text('modelVersion', 160);
    const mediaMimeType = text('mediaMimeType', 100);
    const safetyCategories = text('safetyCategories', 1000);
    const outputCharacters = number('outputCharacters');
    const inputTokens = number('inputTokens');
    const outputTokens = number('outputTokens');
    const reasoningTokens = number('reasoningTokens');
    const totalTokens = number('totalTokens');
    const httpStatus = number('httpStatus');
    const candidateCount = number('candidateCount');
    const partCount = number('partCount');
    const textPartCount = number('textPartCount');
    const thoughtPartCount = number('thoughtPartCount');
    const mediaBytes = number('mediaBytes');
    const safetyRatingCount = number('safetyRatingCount');
    const blockedSafetyRatingCount = number('blockedSafetyRatingCount');
    const startsWithJsonContainer = boolean('startsWithJsonContainer');
    const endsWithJsonContainer = boolean('endsWithJsonContainer');
    const markdownFenceRemoved = boolean('markdownFenceRemoved');
    if (stopReason) result.stopReason = stopReason;
    if (finishReason) result.finishReason = finishReason;
    if (nativeFinishReason) result.nativeFinishReason = nativeFinishReason;
    if (providerRequestId) result.providerRequestId = providerRequestId;
    if (providerStatus) result.providerStatus = providerStatus;
    if (providerMessage) result.providerMessage = providerMessage;
    if (blockReason) result.blockReason = blockReason;
    if (blockReasonMessage) result.blockReasonMessage = blockReasonMessage;
    if (finishMessage) result.finishMessage = finishMessage;
    if (responseId) result.responseId = responseId;
    if (modelVersion) result.modelVersion = modelVersion;
    if (mediaMimeType) result.mediaMimeType = mediaMimeType;
    if (safetyCategories) result.safetyCategories = safetyCategories;
    if (outputCharacters !== undefined)
      result.outputCharacters = outputCharacters;
    if (inputTokens !== undefined) result.inputTokens = inputTokens;
    if (outputTokens !== undefined) result.outputTokens = outputTokens;
    if (reasoningTokens !== undefined) result.reasoningTokens = reasoningTokens;
    if (totalTokens !== undefined) result.totalTokens = totalTokens;
    if (httpStatus !== undefined) result.httpStatus = httpStatus;
    if (candidateCount !== undefined) result.candidateCount = candidateCount;
    if (partCount !== undefined) result.partCount = partCount;
    if (textPartCount !== undefined) result.textPartCount = textPartCount;
    if (thoughtPartCount !== undefined)
      result.thoughtPartCount = thoughtPartCount;
    if (mediaBytes !== undefined) result.mediaBytes = mediaBytes;
    if (safetyRatingCount !== undefined)
      result.safetyRatingCount = safetyRatingCount;
    if (blockedSafetyRatingCount !== undefined)
      result.blockedSafetyRatingCount = blockedSafetyRatingCount;
    if (startsWithJsonContainer !== undefined)
      result.startsWithJsonContainer = startsWithJsonContainer;
    if (endsWithJsonContainer !== undefined)
      result.endsWithJsonContainer = endsWithJsonContainer;
    if (markdownFenceRemoved !== undefined)
      result.markdownFenceRemoved = markdownFenceRemoved;
    return result;
  }
}
