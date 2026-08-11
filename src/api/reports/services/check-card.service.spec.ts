import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import type { Verification } from '../../verifications/schemas/verification.schema';
import { ReportStatus, ReportVisibility } from '../enums/report.enum';
import type { Report, ReportDocument } from '../schemas/report.schema';
import { CheckCardService } from './check-card.service';
import type { AnalyticsService } from '../../analytics/services/analytics.service';

describe('CheckCardService', () => {
  const config = {
    get: jest.fn().mockReturnValue('https://verith.example'),
  } as unknown as ConfigService;
  const service = new CheckCardService(
    {} as Model<Report>,
    {} as Model<Verification>,
    config,
    {} as AnalyticsService,
  );

  it('uses only public-safe report fields and withholds a private link', () => {
    const card = service['fromReport'](
      reportFixture({ visibility: ReportVisibility.PRIVATE }),
    );

    expect(card).toMatchObject({
      claim: 'A dated claim',
      publicReportUrl: null,
      shareState: 'PRIVATE',
    });
    expect(card).not.toHaveProperty('providerSummary');
    expect(card).not.toHaveProperty('verificationId');
    expect(card).not.toHaveProperty('reportId');
  });

  it('escapes report content in downloadable SVG and includes a public link', () => {
    const card = service['fromReport'](
      reportFixture({
        visibility: ReportVisibility.UNLISTED,
        publicSlug: 'safe-link',
        claims: [{ text: '<script>alert(1)</script>' }],
      }),
    );
    const svg = service.renderSvg(card).toString('utf8');

    expect(card.publicReportUrl).toBe(
      'https://verith.example/reports/safe-link',
    );
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).not.toContain('<script>alert(1)</script>');
  });
});

function reportFixture(overrides: Partial<Report>): ReportDocument {
  return {
    id: 'report-id',
    version: 2,
    overallVerdict: 'INSUFFICIENT_EVIDENCE',
    summary: 'The evidence remains incomplete.',
    claims: [{ text: 'A dated claim' }],
    evidence: [
      {
        title: 'Primary source',
        publisher: 'Example Publisher',
        relationship: 'SUPPORTING',
        sourceUrl: 'https://example.com/source',
      },
    ],
    missingContext: [{ omittedContext: 'The original publication date.' }],
    recommendedActions: ['Check the original publication date.'],
    limitations: ['One source could not be opened.'],
    generatedAt: new Date('2026-08-08T00:00:00.000Z'),
    status: ReportStatus.COMPLETE,
    visibility: ReportVisibility.PRIVATE,
    ...overrides,
  } as ReportDocument;
}
