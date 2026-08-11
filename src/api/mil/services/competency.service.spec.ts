import type { Model } from 'mongoose';
import { CompetencyLevel } from '../enums/competency-level.enum';
import type { CompetencyEvidence } from '../schemas/competency-evidence.schema';
import type { MilGrowthProfile } from '../schemas/mil-growth-profile.schema';
import { CompetencyService } from './competency.service';

describe('CompetencyService rules', () => {
  const service = new CompetencyService(
    {} as Model<CompetencyEvidence>,
    {} as Model<MilGrowthProfile>,
  );

  it('does not infer growth from fewer than two scored activities', () => {
    expect(service['level'](1, 1)).toBe(CompetencyLevel.BEGINNING);
  });

  it('uses deterministic thresholds for demonstrated proficiency', () => {
    expect(service['level'](4, 0.7)).toBe(CompetencyLevel.PROFICIENT);
    expect(service['level'](8, 0.85)).toBe(CompetencyLevel.ADVANCED);
  });
});
