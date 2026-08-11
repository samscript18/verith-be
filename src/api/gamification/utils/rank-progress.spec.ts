import { RankCode } from '../enums/gamification.enum';
import { calculateRankProgress } from './rank-progress';

describe('calculateRankProgress', () => {
  it.each([
    [0, RankCode.NOVICE, 250, 0],
    [249, RankCode.NOVICE, 1, 99.6],
    [250, RankCode.EXPLORER, 500, 0],
    [749, RankCode.EXPLORER, 1, 99.8],
    [750, RankCode.INVESTIGATOR, 750, 0],
    [1499, RankCode.INVESTIGATOR, 1, 99.87],
    [1500, RankCode.VERIFIER, 1500, 0],
    [2999, RankCode.VERIFIER, 1, 99.93],
  ])('maps %i XP to %s', (xp, rank, remaining, progress) => {
    const result = calculateRankProgress(xp);
    expect(result.currentRank).toBe(rank);
    expect(result.xpUntilNextRank).toBe(remaining);
    expect(result.progressPercentage).toBe(progress);
  });

  it('returns a terminal state at the highest rank', () => {
    const result = calculateRankProgress(9000);
    expect(result.currentRank).toBe(RankCode.TRUTH_CHAMPION);
    expect(result.nextRank).toBeNull();
    expect(result.xpUntilNextRank).toBe(0);
    expect(result.progressPercentage).toBe(100);
  });

  it('normalizes invalid and negative XP without inventing progress', () => {
    expect(calculateRankProgress(-20)).toEqual(calculateRankProgress(0));
    expect(calculateRankProgress(Number.NaN)).toEqual(calculateRankProgress(0));
  });
});
