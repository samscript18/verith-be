import type { Model } from 'mongoose';
import type { Challenge } from '../../challenges/schemas/challenge.schema';
import type { Course } from '../../learning/schemas/course.schema';
import type { Lesson } from '../../learning/schemas/lesson.schema';
import type { Verification } from '../../verifications/schemas/verification.schema';
import { MilFindingTaxonomy } from '../enums/mil-finding-taxonomy.enum';
import type { Report } from '../schemas/report.schema';
import { MilCoachService } from './mil-coach.service';

describe('MilCoachService taxonomy', () => {
  const service = new MilCoachService(
    {} as Model<Report>,
    {} as Model<Verification>,
    {} as Model<Lesson>,
    {} as Model<Course>,
    {} as Model<Challenge>,
  );

  it('maps only a recorded manipulation finding to coaching', () => {
    const finding = service['primaryFinding'](
      reportFixture({
        manipulationAnalysis: [{ category: 'ARTIFICIAL_URGENCY' }],
      }),
    );

    expect(finding.taxonomy).toBe(MilFindingTaxonomy.ARTIFICIAL_URGENCY);
    expect(finding.whatHappened).toContain('artificial urgency');
  });

  it('maps a recorded missing-date finding without AI inference', () => {
    const finding = service['primaryFinding'](
      reportFixture({
        missingContext: [
          { type: 'DATE_OMITTED', omittedContext: 'The notice is from 2022.' },
        ],
      }),
    );

    expect(finding).toEqual({
      taxonomy: MilFindingTaxonomy.MISSING_DATE,
      whatHappened:
        'The report identified this missing context: The notice is from 2022.',
    });
  });
});

function reportFixture(overrides: Partial<Report>): Report {
  return {
    manipulationAnalysis: [],
    missingContext: [],
    evidence: [],
    limitations: [],
    overallVerdict: 'INSUFFICIENT_EVIDENCE',
    confidence: 0,
    ...overrides,
  } as Report;
}
