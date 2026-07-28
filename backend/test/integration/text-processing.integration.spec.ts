import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { AiRouterService } from '../../src/api/ai/services/ai-router.service';
import { VerificationSourceType } from '../../src/api/verifications/enums/verification-source-type.enum';
import { VerificationStage } from '../../src/api/verifications/enums/verification-stage.enum';
import { VerificationStatus } from '../../src/api/verifications/enums/verification-status.enum';
import { VerificationService } from '../../src/api/verifications/services/verification.service';

describe('Text and URL processing lifecycle (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: VerificationService;

  beforeAll(async () => {
    const ai = {
      execute: jest
        .fn()
        .mockImplementation((request: { promptKey: string }) => {
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
        }),
    };
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiRouterService)
      .useValue(ai)
      .compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(VerificationService);
  });

  afterAll(async () => {
    for (const collection of [
      'verification_claims',
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
      return current.currentStage === VerificationStage.EVIDENCE_SEARCH;
    });
    const current = await service.get(userId, id);
    expect(current).toMatchObject({
      status: VerificationStatus.PROCESSING,
      currentStage: VerificationStage.EVIDENCE_SEARCH,
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
