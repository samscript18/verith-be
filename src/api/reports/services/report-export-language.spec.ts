import { ReportService } from './report.service';

describe('ReportService multilingual PDF export', () => {
  it('renders a Yorùbá presentation without dropping the export', async () => {
    const service = Object.create(ReportService.prototype) as {
      renderPdf(report: Record<string, unknown>): Promise<Buffer>;
    };
    const bytes = await service.renderPdf({
      presentationLanguage: 'yo',
      generatedAt: new Date('2026-08-12T08:00:00.000Z'),
      version: 1,
      overallVerdict: 'INSUFFICIENT_EVIDENCE',
      riskLevel: 'UNKNOWN',
      confidence: 0.35,
      summary: 'Ẹ̀rí tí ó wà kò tíì tó láti ṣe ìdájọ́ tó dájú.',
      claims: [
        {
          displayText: 'Ìkéde náà sọ pé ilé-ẹ̀kọ́ yóò ti ilẹ̀kùn.',
          verdict: 'INSUFFICIENT_EVIDENCE',
          confidence: 0.35,
          explanation: 'A nílò orísun àkọ́kọ́ àti ìmúdájú olómìnira.',
        },
      ],
      evidence: [],
      missingContext: [],
      manipulationAnalysis: [],
      recommendedActions: ['Yẹ orísun àkọ́kọ́ wò kí o tó pín ìkéde náà.'],
      limitations: ['A kò rí ìmúdájú olómìnira.'],
    });

    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.includes(Buffer.from('/ToUnicode'))).toBe(true);
    expect(bytes.includes(Buffer.from('/FontFile2'))).toBe(true);
    expect(bytes.includes(Buffer.from('/FontFile3'))).toBe(false);
  });
});
