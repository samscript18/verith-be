import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import {
  ExternalProviderException,
  NotFoundException,
} from '../../../core/exceptions';
import type { AiConfig } from '../../../shared/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import type { AiProvider } from '../interfaces/ai-provider.interface';
import { AI_PROVIDERS } from '../interfaces/ai-provider.interface';
import type {
  AiRouterRequest,
  AiRouterResult,
} from '../interfaces/ai-router.interface';
import { ProviderExecution } from '../schemas/provider-execution.schema';
import { PromptRegistryService } from './prompt-registry.service';
import { ProviderConfigService } from './provider-config.service';

@Injectable()
export class AiRouterService {
  private readonly config: AiConfig;

  constructor(
    @Inject(AI_PROVIDERS) private readonly providers: AiProvider[],
    @InjectModel(ProviderExecution.name)
    private readonly executionModel: Model<ProviderExecution>,
    private readonly prompts: PromptRegistryService,
    private readonly providerConfig: ProviderConfigService,
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
    if (!candidates.length) {
      throw new ExternalProviderException(
        'No configured AI provider supports this capability',
        'AI_PROVIDER_NOT_CONFIGURED',
      );
    }
    const primaryProvider = candidates[0]!.provider;
    let lastCode = 'AI_PROVIDER_UNAVAILABLE';

    // At most two paid/provider executions per capability: either one
    // schema-correction attempt or one bounded provider fallback.
    const maxProviderCalls = 2;
    const attemptsPerProvider = Math.min(
      maxProviderCalls,
      this.config.maxRetries + 1,
    );
    let providerCalls = 0;
    providerLoop: for (const provider of candidates.slice(0, 2)) {
      const model = provider.modelFor(request.capability);
      if (!model) continue;
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
      for (let attempt = 1; attempt <= attemptsPerProvider; attempt += 1) {
        if (providerCalls >= maxProviderCalls) break providerLoop;
        providerCalls += 1;
        const startedAt = new Date();
        try {
          const result = await provider.execute({
            capability: request.capability,
            model,
            systemPrompt: prompt.systemPrompt,
            userPrompt:
              attempt === 1
                ? userPrompt
                : `${userPrompt}\n\nReturn only JSON matching the required schema. Correct the previous invalid structure.`,
            outputSchemaName: request.outputSchemaName,
            outputJsonSchema: request.outputJsonSchema,
            ...(request.temperature !== undefined
              ? { temperature: request.temperature }
              : {}),
            ...(request.maxOutputTokens !== undefined
              ? { maxOutputTokens: request.maxOutputTokens }
              : {}),
            ...(request.media ? { media: request.media } : {}),
          });
          const validation = request.outputValidator.validate(result.output, {
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: false,
          });
          if (validation.error) {
            lastCode = 'AI_OUTPUT_VALIDATION_FAILED';
            await this.record(request, {
              provider: provider.provider,
              primaryProvider,
              model: result.model,
              promptVersion: prompt.version,
              startedAt,
              success: false,
              safeFailureCode: lastCode,
              attempt,
              usage: result.usage,
              ...(result.providerRequestId
                ? { providerRequestId: result.providerRequestId }
                : {}),
            });
            continue;
          }
          await this.record(request, {
            provider: provider.provider,
            primaryProvider,
            model: result.model,
            promptVersion: prompt.version,
            startedAt,
            success: true,
            attempt,
            usage: result.usage,
            ...(result.providerRequestId
              ? { providerRequestId: result.providerRequestId }
              : {}),
          });
          return {
            output: validation.value,
            provider: provider.provider,
            primaryProvider,
            fallbackUsed: provider.provider !== primaryProvider,
            model: result.model,
            promptVersion: prompt.version,
            usage: result.usage,
          };
        } catch (error) {
          lastCode =
            error instanceof ExternalProviderException
              ? error.code
              : 'AI_PROVIDER_EXECUTION_FAILED';
          await this.record(request, {
            provider: provider.provider,
            primaryProvider,
            model,
            promptVersion: prompt.version,
            startedAt,
            success: false,
            safeFailureCode: lastCode,
            attempt,
            usage: {},
          });
          break;
        }
      }
    }
    throw new ExternalProviderException(
      'No AI provider produced a valid result',
      lastCode,
    );
  }

  private async candidates(
    capability: AiCapability,
    preferred?: AiProviderName,
  ): Promise<AiProvider[]> {
    const runtime = await this.providerConfig.get();
    const capabilityOrder = this.defaultOrder(capability);
    const configured = runtime.defaultOrder.filter((provider) =>
      runtime.enabledProviders.includes(provider),
    );
    const order = [
      ...configured.filter((provider) => capabilityOrder.includes(provider)),
      ...capabilityOrder.filter(
        (provider) =>
          runtime.enabledProviders.includes(provider) &&
          !configured.includes(provider),
      ),
    ];
    if (preferred) {
      const withoutPreferred = order.filter((item) => item !== preferred);
      order.splice(0, order.length, preferred, ...withoutPreferred);
    }
    return order
      .map((name) =>
        this.providers.find((provider) => provider.provider === name),
      )
      .filter((provider): provider is AiProvider =>
        Boolean(
          provider?.supports(capability) && provider.modelFor(capability),
        ),
      );
  }

  private defaultOrder(capability: AiCapability): AiProviderName[] {
    if (
      [AiCapability.IMAGE_UNDERSTANDING, AiCapability.OCR_FALLBACK].includes(
        capability,
      )
    ) {
      return [AiProviderName.GEMINI, AiProviderName.OPENROUTER];
    }
    if (
      [AiCapability.AUDIO_REASONING, AiCapability.VIDEO_UNDERSTANDING].includes(
        capability,
      )
    ) {
      return [AiProviderName.GEMINI];
    }
    if (
      [
        AiCapability.CONTEXT_ANALYSIS,
        AiCapability.EVIDENCE_SYNTHESIS,
        AiCapability.REPORT_GENERATION,
      ].includes(capability)
    ) {
      return [AiProviderName.OPENROUTER, AiProviderName.GEMINI];
    }
    return [
      AiProviderName.GROQ,
      AiProviderName.OPENROUTER,
      AiProviderName.GEMINI,
    ];
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
      attempt: number;
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
      providerRequestId?: string;
    },
  ): Promise<void> {
    const endedAt = new Date();
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
      ...(data.providerRequestId
        ? { providerRequestId: data.providerRequestId }
        : {}),
      ...data.usage,
      attempt: data.attempt,
      deleteAfter: new Date(
        Date.now() + this.config.executionRetentionDays * 86400000,
      ),
    });
  }
}
