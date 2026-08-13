import type { AiExecutionRequest } from '../interfaces/ai-provider.interface';

type ReasoningEffort = NonNullable<AiExecutionRequest['reasoningEffort']>;

/**
 * Gemini 2.5 counts thinking tokens inside maxOutputTokens. Bound thinking for
 * schema-constrained work so internal reasoning cannot consume the JSON body.
 * Unknown model families are left untouched instead of sending an unsupported
 * provider option.
 */
export function geminiThinkingConfig(
  model: string,
  effort: ReasoningEffort | undefined,
): { thinkingBudget: number } | undefined {
  if (!effort) return undefined;
  const normalized = model.toLowerCase();
  if (!normalized.includes('gemini-2.5')) return undefined;

  const flashLite = normalized.includes('flash-lite');
  const pro = normalized.includes('pro');
  const budgets: Record<ReasoningEffort, number> = {
    none: pro ? 128 : 0,
    minimal: flashLite ? 512 : pro ? 256 : 128,
    low: 1024,
    medium: 4096,
    high: 8192,
  };
  return { thinkingBudget: budgets[effort] };
}
