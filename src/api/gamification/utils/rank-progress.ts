import { RANK_THRESHOLDS } from '../constants/rank.constants';

export interface RankProgress {
  currentRank: (typeof RANK_THRESHOLDS)[number]['code'];
  currentRankLabel: string;
  currentRankIconKey: string;
  currentXp: number;
  currentRankMinXp: number;
  nextRank: (typeof RANK_THRESHOLDS)[number]['code'] | null;
  nextRankLabel: string | null;
  nextRankMinXp: number | null;
  xpUntilNextRank: number;
  progressPercentage: number;
}

export function calculateRankProgress(value: number): RankProgress {
  const xp = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  let index = 0;
  for (let cursor = 1; cursor < RANK_THRESHOLDS.length; cursor += 1) {
    const candidate = RANK_THRESHOLDS[cursor];
    if (!candidate || xp < candidate.minXp) break;
    index = cursor;
  }
  const current = RANK_THRESHOLDS[index] ?? RANK_THRESHOLDS[0]!;
  const next = RANK_THRESHOLDS[index + 1] ?? null;
  if (!next) {
    return {
      currentRank: current.code,
      currentRankLabel: current.label,
      currentRankIconKey: current.iconKey,
      currentXp: xp,
      currentRankMinXp: current.minXp,
      nextRank: null,
      nextRankLabel: null,
      nextRankMinXp: null,
      xpUntilNextRank: 0,
      progressPercentage: 100,
    };
  }
  const span = next.minXp - current.minXp;
  const progress = span ? ((xp - current.minXp) / span) * 100 : 100;
  return {
    currentRank: current.code,
    currentRankLabel: current.label,
    currentRankIconKey: current.iconKey,
    currentXp: xp,
    currentRankMinXp: current.minXp,
    nextRank: next.code,
    nextRankLabel: next.label,
    nextRankMinXp: next.minXp,
    xpUntilNextRank: Math.max(0, next.minXp - xp),
    progressPercentage: Math.max(
      0,
      Math.min(100, Math.round(progress * 100) / 100),
    ),
  };
}
