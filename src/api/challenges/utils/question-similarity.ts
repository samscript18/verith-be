import { createHash } from 'node:crypto';

export function normalizeQuestionPrompt(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(
      /\b(?:public health|elections?|climate|weather|education|schools?|money|scams?|images?|videos?|science|technology|jobs?|recruitment|scholarships?|banking|finance|security|government|social media|rumours?|voice notes?|news headlines?|statistics|numbers|celebrity information)\b/g,
      'topic',
    )
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' date ')
    .replace(/\b\d+\b/g, ' number ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function questionSignature(value: string): string {
  return createHash('sha256')
    .update(normalizeQuestionPrompt(value))
    .digest('hex');
}

export function questionSimilarity(left: string, right: string): number {
  const leftTokens = new Set(
    normalizeQuestionPrompt(left).split(' ').filter(Boolean),
  );
  const rightTokens = new Set(
    normalizeQuestionPrompt(right).split(' ').filter(Boolean),
  );
  if (!leftTokens.size && !rightTokens.size) return 1;
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}
