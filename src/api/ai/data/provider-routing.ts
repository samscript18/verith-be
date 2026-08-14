import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';

export const DEFAULT_CAPABILITY_ROUTES: Record<
  AiCapability,
  readonly AiProviderName[]
> = {
  [AiCapability.CLAIM_EXTRACTION]: [
    AiProviderName.GROQ,
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.GEMINI,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.STRUCTURED_EXTRACTION]: [
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.EVIDENCE_SYNTHESIS]: [
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.GEMINI,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.REPORT_GENERATION]: [
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
    AiProviderName.GEMINI,
  ],
  [AiCapability.TRANSLATION]: [
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.IMAGE_UNDERSTANDING]: [
    AiProviderName.VERTEX,
    AiProviderName.GEMINI,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.OCR_FALLBACK]: [
    AiProviderName.VERTEX,
    AiProviderName.GEMINI,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.VIDEO_UNDERSTANDING]: [
    AiProviderName.VERTEX,
    AiProviderName.GEMINI,
  ],
  [AiCapability.AUDIO_REASONING]: [AiProviderName.GEMINI],
  [AiCapability.DAILY_CHALLENGE_GENERATION]: [
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.VERTEX,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.TEXT_REASONING]: [
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.SUMMARIZATION]: [
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.MANIPULATION_ANALYSIS]: [
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.BIAS_ANALYSIS]: [
    AiProviderName.GROQ,
    AiProviderName.GEMINI,
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
  ],
  [AiCapability.CONTEXT_ANALYSIS]: [
    AiProviderName.VERTEX,
    AiProviderName.BEDROCK,
    AiProviderName.OPENROUTER,
    AiProviderName.GEMINI,
  ],
};

export const PAID_AI_PROVIDERS = new Set<AiProviderName>([
  AiProviderName.VERTEX,
  AiProviderName.BEDROCK,
]);

export function maxProviderCallsFor(capability: AiCapability): number {
  if (capability === AiCapability.VIDEO_UNDERSTANDING) return 1;
  if (
    [
      AiCapability.CLAIM_EXTRACTION,
      AiCapability.STRUCTURED_EXTRACTION,
      AiCapability.EVIDENCE_SYNTHESIS,
      AiCapability.REPORT_GENERATION,
      AiCapability.TRANSLATION,
      AiCapability.IMAGE_UNDERSTANDING,
      AiCapability.OCR_FALLBACK,
    ].includes(capability)
  )
    return 3;
  return 2;
}

export function defaultMaxOutputTokens(capability: AiCapability): number {
  // A complete eight-claim result includes canonical text, exact source spans,
  // classifications, entities and search hints. The previous 2,400-token cap
  // could truncate otherwise schema-constrained JSON before its closing tokens.
  if (capability === AiCapability.CLAIM_EXTRACTION) return 6000;
  if (capability === AiCapability.STRUCTURED_EXTRACTION) return 4000;
  // The analysis service requests 10,000 tokens because the complete schema
  // can contain eight claim evaluations plus evidence relationships, bias,
  // manipulation and missing-context records. Capping it at 5,000 silently
  // truncated otherwise valid structured responses.
  if (capability === AiCapability.EVIDENCE_SYNTHESIS) return 10000;
  if (capability === AiCapability.REPORT_GENERATION) return 6000;
  // Localized reports can contain the summary plus every user-facing claim,
  // limitation and recommendation. The localization service already requests
  // 8,000 tokens; keep the router ceiling aligned so valid JSON is not cut off
  // at the former 5,000-token global cap.
  if (capability === AiCapability.TRANSLATION) return 8000;
  if (capability === AiCapability.DAILY_CHALLENGE_GENERATION) return 7000;
  if (
    [AiCapability.IMAGE_UNDERSTANDING, AiCapability.OCR_FALLBACK].includes(
      capability,
    )
  )
    return 5000;
  // Short videos may need a verbatim transcript, visible text, timestamped
  // observations, and limitations in one schema-constrained response.
  if (capability === AiCapability.VIDEO_UNDERSTANDING) return 7000;
  if (capability === AiCapability.AUDIO_REASONING) return 8000;
  return 3500;
}
