import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../../shared/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class OpenRouterProvider extends OpenAiCompatibleProvider {
  readonly provider = AiProviderName.OPENROUTER;
  readonly capabilities = new Set([
    AiCapability.TEXT_REASONING,
    AiCapability.STRUCTURED_EXTRACTION,
    AiCapability.CONTEXT_ANALYSIS,
    AiCapability.EVIDENCE_SYNTHESIS,
    AiCapability.REPORT_GENERATION,
    AiCapability.MANIPULATION_ANALYSIS,
    AiCapability.BIAS_ANALYSIS,
    AiCapability.TRANSLATION,
  ]);
  private readonly siteUrl: string;
  private readonly appName: string;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AiConfig>('ai').openRouter;
    super(config);
    this.siteUrl = config.siteUrl;
    this.appName = config.appName;
  }

  modelFor(capability: AiCapability): string | null {
    const key =
      capability === AiCapability.REPORT_GENERATION ? 'report' : 'reasoning';
    return this.capabilities.has(capability) && this.config.models[key]
      ? this.config.models[key]
      : null;
  }

  protected extraHeaders(): Record<string, string> {
    return {
      ...(this.siteUrl ? { 'HTTP-Referer': this.siteUrl } : {}),
      'X-OpenRouter-Title': this.appName,
    };
  }

  protected override providerPreferences(): Record<string, unknown> {
    return { require_parameters: true };
  }
}
