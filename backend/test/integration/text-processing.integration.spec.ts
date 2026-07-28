import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { AiRouterService } from '../../src/api/ai/services/ai-router.service';
import { VerificationSourceType } from '../../src/api/verifications/enums/verification-source-type.enum';
import { VerificationStage } from '../../src/api/verifications/enums/verification-stage.enum';
import { VerificationStatus } from '../../src/api/verifications/enums/verification-status.enum';
import { VerificationService } from '../../src/api/verifications/services/verification.service';
import { SearchRouterService } from '../../src/api/search/services/search-router.service';
import { ArticleExtractionService } from '../../src/api/verifications/services/article-extraction.service';
import { ValidationException } from '../../src/core/exceptions';
import { ReportService } from '../../src/api/reports/services/report.service';
import {
  ReportExportFormat,
  ReportVisibility,
} from '../../src/api/reports/enums/report.enum';

describe('Text and URL processing lifecycle (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: VerificationService;
  let reports: ReportService;

  beforeAll(async () => {
    const ai = {
      execute: jest
        .fn()
        .mockImplementation(
          (request: {
            promptKey: string;
            variables?: { claims: string; evidence: string };
          }) => {
            if (request.promptKey === 'verification.claim-extraction') {
              return Promise.resolve({
                output: {
                  claims: [
                    {
                      text: 'The city council approved a new tax.',
                      claimType: 'POLICY',
                      importance: 'HIGH',
                      verifiability: 'VERIFIABLE',
                      timeSensitivity: 'RECENT',
                      entities: ['city council'],
                      dates: [],
                      locations: [],
                      quantities: [],
                      sourceSpan: { start: 0, end: 36 },
                      requiresCurrentInformation: true,
                      searchHints: ['city council tax approval'],
                    },
                    {
                      text: 'This is a terrible idea.',
                      claimType: 'OTHER',
                      importance: 'LOW',
                      verifiability: 'VALUE_JUDGMENT',
                      timeSensitivity: 'TIMELESS',
                      entities: [],
                      dates: [],
                      locations: [],
                      quantities: [],
                      sourceSpan: { start: 37, end: 61 },
                      requiresCurrentInformation: false,
                      searchHints: [],
                    },
                  ],
                },
                provider: 'GROQ',
                primaryProvider: 'GROQ',
                fallbackUsed: false,
                model: 'test-model',
                promptVersion: 1,
                usage: {},
              });
            }
            if (request.promptKey === 'verification.analysis') {
              const variables = request.variables!;
              const claims = JSON.parse(variables.claims) as Array<{
                id: string;
              }>;
              const evidence = JSON.parse(variables.evidence) as Array<{
                id: string;
                claimId: string;
              }>;
              return Promise.resolve({
                output: {
                  claims: claims.map((claim) => ({
                    claimId: claim.id,
                    evidence: evidence
                      .filter((item) => item.claimId === claim.id)
                      .map((item) => ({
                        evidenceId: item.id,
                        relationship: 'SUPPORTS',
                      })),
                    explanation:
                      'The retrieved official record supports the factual claim.',
                    evidenceSummary:
                      'The council minutes record the approval vote.',
                    uncertainties: [],
                    limitations: ['Only the supplied sources were assessed.'],
                  })),
                  manipulation: [],
                  bias: [
                    'EMOTIONAL_INTENSITY',
                    'SENSATIONALISM',
                    'NEUTRALITY',
                    'EVIDENCE_BALANCE',
                    'HEADLINE_ALIGNMENT',
                    'LOADED_LANGUAGE',
                    'CERTAINTY_INFLATION',
                  ].map((metric) => ({
                    metric,
                    score: metric === 'NEUTRALITY' ? 0.8 : 0.2,
                    label: metric === 'NEUTRALITY' ? 'Mostly neutral' : 'Low',
                    explanation: 'The short item uses restrained language.',
                    textEvidence: ['The city council approved a new tax.'],
                    limitations: ['The sample is short.'],
                  })),
                  missingContext: [],
                },
                provider: 'OPENROUTER',
                primaryProvider: 'OPENROUTER',
                fallbackUsed: false,
                model: 'test-model',
                promptVersion: 1,
                usage: {},
              });
            }
            return Promise.resolve({
              output: {
                claims: [
                  {
                    sequence: 1,
                    queries: [
                      {
                        query: 'city council new tax official approval',
                        category: 'OFFICIAL',
                      },
                    ],
                  },
                ],
              },
              provider: 'GROQ',
              primaryProvider: 'GROQ',
              fallbackUsed: false,
              model: 'test-model',
              promptVersion: 1,
              usage: {},
            });
          },
        ),
    };
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiRouterService)
      .useValue(ai)
      .overrideProvider(SearchRouterService)
      .useValue({
        search: jest.fn().mockResolvedValue({
          provider: 'TAVILY',
          results: [
            {
              title: 'Council record',
              url: 'https://city.gov.example/council-tax',
              snippet: 'Provider snippet is not evidence.',
              providerScore: 0.9,
            },
            {
              title: 'Council record copy',
              url: 'https://mirror.example/council-tax',
              snippet: 'A duplicate provider snippet.',
              providerScore: 0.8,
            },
          ],
        }),
      })
      .overrideProvider(ArticleExtractionService)
      .useValue({
        extract: jest.fn().mockImplementation((url: string) => {
          if (url.includes('127.0.0.1')) {
            throw new ValidationException('Unsafe URL', [
              { field: 'url', message: 'resolves to a private address' },
            ]);
          }
          return Promise.resolve({
            state: 'EXTRACTED',
            sourceUrl: url,
            canonicalUrl: url,
            title: 'City council official record',
            publisher: 'City Council',
            publishedAt: new Date('2026-07-01T00:00:00.000Z'),
            text:
              'The city council approved a new tax after a recorded vote. ' +
              'The official minutes list the vote and effective date. '.repeat(
                6,
              ),
            confidence: 1,
          });
        }),
      })
      .compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(VerificationService);
    reports = moduleRef.get(ReportService);
  });

  afterAll(async () => {
    for (const collection of [
      'verification_claims',
      'evidence',
      'claim_evaluations',
      'verification_analyses',
      'publishers',
      'reports',
      'report_feedback',
      'report_exports',
      'verification_extracted_contents',
      'verification_events',
      'idempotency_records',
      'verifications',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
    await moduleRef.close();
  });

  it('normalizes text and persists claims plus focused queries', async () => {
    const userId = new Types.ObjectId().toString();
    const created = await service.create(
      userId,
      {
        sourceType: VerificationSourceType.TEXT,
        text: 'The city council approved a new tax. This is a terrible idea.',
      },
      'text-processing-key-001',
      'req-text',
    );
    const id = created.id as string;
    await waitUntil(async () => {
      const current = await service.get(userId, id);
      return current.currentStage === VerificationStage.COMPLETED;
    });
    const current = await service.get(userId, id);
    expect(current).toMatchObject({
      status: VerificationStatus.COMPLETED,
      currentStage: VerificationStage.COMPLETED,
      claimsCount: 2,
      detectedLanguage: 'en',
    });
    const claims = await connection
      .collection('verification_claims')
      .find({ verificationId: new Types.ObjectId(id) })
      .toArray();
    expect(claims[0]).toMatchObject({
      normalizedText: 'the city council approved a new tax',
      searchQueries: [
        {
          query: 'city council new tax official approval',
          category: 'OFFICIAL',
        },
      ],
    });
    expect(claims[1]).toMatchObject({
      verifiability: 'VALUE_JUDGMENT',
      searchQueries: [],
    });
    const evidence = await connection
      .collection('evidence')
      .find({ verificationId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 })
      .toArray();
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      accessStatus: 'AVAILABLE',
      relationship: 'SUPPORTS',
      lineageType: 'UNIQUE',
      metadata: { searchSnippetIsEvidence: false },
    });
    expect(evidence[0]?.relevantExcerpt).toContain(
      'The city council approved a new tax',
    );
    expect(evidence[1]).toMatchObject({
      lineageType: 'DUPLICATE',
      duplicateOfEvidenceId: evidence[0]?._id,
    });
    const evaluation = await connection
      .collection('claim_evaluations')
      .findOne({
        verificationId: new Types.ObjectId(id),
        claimId: claims[0]?._id,
      });
    expect(evaluation).toMatchObject({
      verdict: 'SUPPORTED',
      confidenceFactors: {
        structuredOutputValid: true,
        contradictoryEvidencePresent: false,
      },
    });
    expect(evaluation?.confidence).toBeGreaterThan(0);
    const analysis = await connection
      .collection('verification_analyses')
      .findOne({ verificationId: new Types.ObjectId(id) });
    expect(analysis).toMatchObject({
      overallVerdict: 'SUPPORTED',
      riskLevel: 'LOW',
      methodVersion: 'verification-analysis.v1',
    });
    const report = await connection
      .collection('reports')
      .findOne({ verificationId: new Types.ObjectId(id) });
    expect(report).toMatchObject({
      version: 1,
      status: 'COMPLETE',
      visibility: 'PRIVATE',
      schemaVersion: 'report.v1',
      overallVerdict: 'SUPPORTED',
    });
    const reportClaims = report?.claims as
      Array<{ supportingEvidenceIds: unknown[] }> | undefined;
    expect(reportClaims?.[0]?.supportingEvidenceIds).toHaveLength(1);
    const pdf = await reports.export(
      userId,
      report!._id.toString(),
      ReportExportFormat.PDF,
    );
    expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
    const json = await reports.export(
      userId,
      report!._id.toString(),
      ReportExportFormat.JSON,
    );
    const exported = JSON.parse(json.bytes.toString()) as Record<
      string,
      unknown
    >;
    expect(exported.providerSummary).toBeUndefined();
    const shared = await reports.setVisibility(
      userId,
      report!._id.toString(),
      ReportVisibility.UNLISTED,
    );
    const publicReport = await reports.publicBySlug(String(shared.publicSlug));
    expect(publicReport.providerSummary).toBeUndefined();
    await reports.revoke(userId, report!._id.toString());
    await expect(
      reports.publicBySlug(String(shared.publicSlug)),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });

  it('rejects an unsafe URL asynchronously with an honest state', async () => {
    const userId = new Types.ObjectId().toString();
    const created = await service.create(
      userId,
      {
        sourceType: VerificationSourceType.URL,
        url: 'http://127.0.0.1/internal',
      },
      'unsafe-url-key-0001',
      'req-url',
    );
    const id = created.id as string;
    await waitUntil(async () => {
      const current = await service.get(userId, id);
      return current.status === VerificationStatus.FAILED;
    });
    await expect(service.get(userId, id)).resolves.toMatchObject({
      status: VerificationStatus.FAILED,
      failureCode: 'VALIDATION_ERROR',
      urlMetadata: {
        extractionState: 'UNSAFE_URL',
        failureCode: 'VALIDATION_ERROR',
      },
    });
  });
});

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for content processing');
}
