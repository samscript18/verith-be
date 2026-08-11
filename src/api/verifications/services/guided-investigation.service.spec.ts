import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  GuidedInvestigationStatus,
  GuidedQuestionType,
  MediaLiteracyCompetency,
} from '../enums/guided-investigation.enum';
import { InvestigationMode } from '../enums/investigation-mode.enum';
import type { Claim } from '../schemas/claim.schema';
import type { GuidedInvestigation } from '../schemas/guided-investigation.schema';
import type { VerificationDocument } from '../schemas/verification.schema';
import type { Report } from '../../reports/schemas/report.schema';
import { GuidedInvestigationService } from './guided-investigation.service';
import type { CompetencyService } from '../../mil/services/competency.service';

describe('GuidedInvestigationService', () => {
  it('never exposes stored correct option IDs in the read payload', async () => {
    const session = sessionFixture(GuidedInvestigationStatus.READY);
    const service = setup(session);

    const result = await service.get(verificationFixture());

    expect(JSON.stringify(result)).not.toContain('correctOptionIds');
    expect(result).toMatchObject({
      status: GuidedInvestigationStatus.READY,
      questions: [
        expect.objectContaining({ id: 'responsible-sharing' }),
        expect.objectContaining({ id: 'missing-context' }),
      ],
    });
  });

  it('scores only objective questions and persists the original reasoning once', async () => {
    const session = sessionFixture(GuidedInvestigationStatus.READY);
    const service = setup(session);

    const result = await service.submit(verificationFixture(), {
      responses: [
        {
          questionId: 'responsible-sharing',
          selectedOptionIds: ['wait-and-check'],
        },
        { questionId: 'missing-context', text: 'The date is missing.' },
      ],
    });

    expect(session.responses[0]).toMatchObject({
      questionId: 'responsible-sharing',
      score: 1,
    });
    expect(session.responses[1]).not.toHaveProperty('score');
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: GuidedInvestigationStatus.SUBMITTED,
    });
  });
});

function setup(
  session: ReturnType<typeof sessionFixture>,
): GuidedInvestigationService {
  const guided = {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(session),
    }),
  } as unknown as Model<GuidedInvestigation>;
  const claims = {} as Model<Claim>;
  const reports = {
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    }),
  } as unknown as Model<Report>;
  const competencies = {
    recordBatch: jest.fn().mockResolvedValue(undefined),
  } as unknown as CompetencyService;
  return new GuidedInvestigationService(guided, claims, reports, competencies);
}

function verificationFixture(): VerificationDocument {
  return {
    _id: new Types.ObjectId(),
    mode: InvestigationMode.GUIDED,
  } as VerificationDocument;
}

function sessionFixture(status: GuidedInvestigationStatus) {
  return {
    id: new Types.ObjectId().toString(),
    verificationId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    questionSetVersion: 1,
    status,
    questions: [
      {
        id: 'responsible-sharing',
        version: 1,
        type: GuidedQuestionType.SINGLE_SELECT,
        prompt: 'What should you do?',
        options: [
          { id: 'wait-and-check', label: 'Wait and check' },
          { id: 'share-now', label: 'Share now' },
        ],
        competency: MediaLiteracyCompetency.RESPONSIBLE_SHARING,
        objectivelyScorable: true,
        correctOptionIds: ['wait-and-check'],
      },
      {
        id: 'missing-context',
        version: 1,
        type: GuidedQuestionType.SHORT_TEXT,
        prompt: 'What is missing?',
        options: [],
        competency: MediaLiteracyCompetency.CONTEXT_RECOGNITION,
        objectivelyScorable: false,
        correctOptionIds: [],
      },
    ],
    responses: [],
    feedback: [],
    createdAt: new Date(Date.now() - 1_000),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}
