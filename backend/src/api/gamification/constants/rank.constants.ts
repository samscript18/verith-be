import { RankCode } from '../enums/gamification.enum';

export interface RankDefinition {
  code: RankCode;
  label: string;
  minXp: number;
  iconKey: string;
}

export const RANK_THRESHOLDS: readonly RankDefinition[] = [
  { code: RankCode.NOVICE, label: 'Novice', minXp: 0, iconKey: 'spark' },
  {
    code: RankCode.EXPLORER,
    label: 'Explorer',
    minXp: 250,
    iconKey: 'compass',
  },
  {
    code: RankCode.INVESTIGATOR,
    label: 'Investigator',
    minXp: 750,
    iconKey: 'search',
  },
  {
    code: RankCode.VERIFIER,
    label: 'Verifier',
    minXp: 1500,
    iconKey: 'shield',
  },
  {
    code: RankCode.TRUTH_CHAMPION,
    label: 'Truth Champion',
    minXp: 3000,
    iconKey: 'crown',
  },
] as const;

export const ACHIEVEMENT_CATALOG_VERSION = 1;
