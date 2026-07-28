import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../../shared/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class GroqProvider extends OpenAiCompatibleProvider {
  readonly provider = AiProviderName.GROQ;
  readonly capabilities = new Set([
    AiCapability.TEXT_REASONING,
    AiCapability.STRUCTURED_EXTRACTION,
    AiCapability.CLAIM_EXTRACTION,
    AiCapability.SUMMARIZATION,
    AiCapability.MANIPULATION_ANALYSIS,
    AiCapability.BIAS_ANALYSIS,
    AiCapability.TRANSLATION,
  ]);

  constructor(configService: ConfigService) {
    super(configService.getOrThrow<AiConfig>('ai').groq);
  }

  modelFor(capability: AiCapability): string | null {
    return this.capabilities.has(capability) && this.config.models.text
      ? this.config.models.text
      : null;
  }

  protected extraHeaders(): Record<string, string> {
    return {};
  }
}
