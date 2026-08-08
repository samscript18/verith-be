import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConflictException,
  ValidationException,
} from '../../../core/exceptions';
import { Report } from '../../reports/schemas/report.schema';
import { CompetencyEvidenceSource } from '../../mil/enums/competency-level.enum';
import { CompetencyService } from '../../mil/services/competency.service';
import type { SubmitGuidedResponsesDto } from '../dto/guided-investigation.dto';
import {
  GuidedInvestigationStatus,
  GuidedQuestionType,
  MediaLiteracyCompetency,
} from '../enums/guided-investigation.enum';
import { InvestigationMode } from '../enums/investigation-mode.enum';
import { Claim } from '../schemas/claim.schema';
import {
  GuidedInvestigation,
  type GuidedInvestigationDocument,
  type GuidedQuestion,
} from '../schemas/guided-investigation.schema';
import type { VerificationDocument } from '../schemas/verification.schema';

@Injectable()
export class GuidedInvestigationService {
  static readonly QUESTION_SET_VERSION = 1;

  constructor(
    @InjectModel(GuidedInvestigation.name)
    private readonly guided: Model<GuidedInvestigation>,
    @InjectModel(Claim.name) private readonly claims: Model<Claim>,
    @InjectModel(Report.name) private readonly reports: Model<Report>,
    private readonly competencies: CompetencyService,
  ) {}

  async prepare(verification: VerificationDocument): Promise<void> {
    if (verification.mode !== InvestigationMode.GUIDED) return;
    const firstClaim = await this.claims
      .findOne({ verificationId: verification._id })
      .sort({ sequence: 1 })
      .lean()
      .exec();
    await this.guided.updateOne(
      { verificationId: verification._id },
      {
        $setOnInsert: {
          verificationId: verification._id,
          userId: verification.userId,
          questionSetVersion: GuidedInvestigationService.QUESTION_SET_VERSION,
          status: GuidedInvestigationStatus.READY,
          questions: this.questions(firstClaim?.text),
          responses: [],
          feedback: [],
        },
      },
      { upsert: true, runValidators: true },
    );
  }

  async get(
    verification: VerificationDocument,
  ): Promise<Record<string, unknown>> {
    if (verification.mode !== InvestigationMode.GUIDED) {
      throw new ConflictException(
        'This investigation uses standard mode',
        'GUIDED_MODE_NOT_ENABLED',
      );
    }
    const session = await this.findSession(verification._id);
    await this.syncCompetencyEvidence(session);
    await this.refreshFeedback(session);
    return this.toResponse(session);
  }

  async submit(
    verification: VerificationDocument,
    dto: SubmitGuidedResponsesDto,
  ): Promise<Record<string, unknown>> {
    if (verification.mode !== InvestigationMode.GUIDED) {
      throw new ConflictException(
        'This investigation uses standard mode',
        'GUIDED_MODE_NOT_ENABLED',
      );
    }
    const session = await this.findSession(verification._id, true);
    if (session.status !== GuidedInvestigationStatus.READY) {
      throw new ConflictException(
        'Guided responses were already submitted',
        'GUIDED_RESPONSES_ALREADY_SUBMITTED',
      );
    }
    const supplied = new Map(
      dto.responses.map((item) => [item.questionId, item]),
    );
    if (supplied.size !== dto.responses.length) {
      throw new ValidationException(
        'Each guided question may be answered once',
      );
    }
    const submittedAt = new Date();
    const responseTimeMs = Math.max(
      0,
      submittedAt.getTime() - session.createdAt.getTime(),
    );
    session.responses = session.questions.map((question) => {
      const response = supplied.get(question.id);
      if (!response) {
        throw new ValidationException(
          'Answer every guided question before submitting',
        );
      }
      const optionIds = new Set(question.options.map((option) => option.id));
      const selected = [...new Set(response.selectedOptionIds ?? [])];
      if (selected.some((id) => !optionIds.has(id))) {
        throw new ValidationException(
          'A guided response contains an unknown option',
        );
      }
      const text = response.text?.trim();
      if (question.type === GuidedQuestionType.SHORT_TEXT && !text) {
        throw new ValidationException(
          'Write a short response for each reflection question',
        );
      }
      if (
        question.type !== GuidedQuestionType.SHORT_TEXT &&
        (selected.length === 0 ||
          (question.type !== GuidedQuestionType.MULTIPLE_SELECT &&
            selected.length !== 1))
      ) {
        throw new ValidationException(
          'Choose the requested option for every guided question',
        );
      }
      return {
        questionId: question.id,
        selectedOptionIds: selected,
        ...(text ? { text } : {}),
        responseTimeMs,
        competency: question.competency,
        ...(question.objectivelyScorable
          ? { score: this.sameSet(selected, question.correctOptionIds) ? 1 : 0 }
          : {}),
        submittedAt,
      };
    });
    session.status = GuidedInvestigationStatus.SUBMITTED;
    session.submittedAt = submittedAt;
    await session.save();
    await this.syncCompetencyEvidence(session);
    await this.refreshFeedback(session);
    return this.toResponse(session);
  }

  private async refreshFeedback(
    session: GuidedInvestigationDocument,
  ): Promise<void> {
    if (session.status === GuidedInvestigationStatus.READY) return;
    const report = await this.reports
      .findOne({ verificationId: session.verificationId })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (!report) return;
    const responseByQuestion = new Map(
      session.responses.map((response) => [response.questionId, response]),
    );
    session.feedback = session.questions.map((question) => {
      const response = responseByQuestion.get(question.id);
      if (question.id === 'provisional-verdict') {
        const provisional = response?.selectedOptionIds[0];
        const aligned = provisional === report.overallVerdict;
        return {
          questionId: question.id,
          heading: aligned
            ? 'Your first reading aligned'
            : 'The evidence changed the picture',
          message: aligned
            ? `Your provisional view matched the report’s ${this.label(report.overallVerdict)} finding. The important skill is that you waited for evidence before treating it as settled.`
            : `You first chose ${this.label(provisional)}, while the completed evidence supports ${this.label(report.overallVerdict)}. Compare the strongest sources and note what changed your view.`,
          competency: question.competency,
        };
      }
      if (question.id === 'missing-context') {
        const count = report.missingContext.length;
        return {
          questionId: question.id,
          heading: count
            ? 'Compare the missing context'
            : 'Your context check still matters',
          message: count
            ? `Verith retained ${count} missing-context ${count === 1 ? 'finding' : 'findings'}. Compare them with your note and look for dates, locations, baselines, or original framing you identified.`
            : 'The report did not retain a specific missing-context finding. Your written observation remains useful reasoning, but it is not scored as right or wrong.',
          competency: question.competency,
        };
      }
      const correct = response?.score === 1;
      return {
        questionId: question.id,
        heading: correct
          ? 'Strong verification habit'
          : 'A useful habit to practise',
        message: correct
          ? 'You chose the evidence-first response. Keep using that pause-and-check habit before sharing.'
          : question.id === 'source-strength'
            ? 'Strong evidence needs the original source, its date and context, and independent confirmation. Popularity alone does not establish accuracy.'
            : 'Pause before sharing, inspect the source, and wait for evidence when a claim could affect someone’s decisions.',
        competency: question.competency,
      };
    });
    session.status = GuidedInvestigationStatus.FEEDBACK_READY;
    session.feedbackGeneratedAt = new Date();
    await session.save();
  }

  private async syncCompetencyEvidence(
    session: GuidedInvestigationDocument,
  ): Promise<void> {
    if (session.status === GuidedInvestigationStatus.READY) return;
    await this.competencies.recordBatch(
      session.userId.toString(),
      session.responses.map((response) => ({
        competency: response.competency,
        sourceType: CompetencyEvidenceSource.GUIDED_INVESTIGATION,
        sourceActivityId: `${session.id}:${response.questionId}`,
        ...(response.score !== undefined ? { score: response.score } : {}),
        occurredAt: response.submittedAt,
        metadata: {
          verificationId: session.verificationId.toString(),
          questionSetVersion: session.questionSetVersion,
        },
      })),
    );
  }

  private async findSession(
    verificationId: Types.ObjectId,
    includeAnswers = false,
  ): Promise<GuidedInvestigationDocument> {
    const query = this.guided.findOne({ verificationId });
    if (includeAnswers) query.select('+questions.correctOptionIds');
    const session = await query.exec();
    if (!session) {
      throw new ConflictException(
        'The guided exercise is still being prepared',
        'GUIDED_QUESTIONS_NOT_READY',
      );
    }
    return session;
  }

  private questions(firstClaim?: string): GuidedQuestion[] {
    const claimReference = firstClaim
      ? ` Consider this statement: “${firstClaim.slice(0, 280)}”`
      : '';
    return [
      {
        id: 'responsible-sharing',
        version: 1,
        type: GuidedQuestionType.SINGLE_SELECT,
        prompt: `Before you share or act on this content, what is the safest next step?${claimReference}`,
        competency: MediaLiteracyCompetency.RESPONSIBLE_SHARING,
        objectivelyScorable: true,
        correctOptionIds: ['wait-and-check'],
        options: [
          { id: 'share-now', label: 'Share it now because it may be urgent' },
          {
            id: 'wait-and-check',
            label: 'Pause and check the claim against reliable evidence',
          },
          {
            id: 'trust-popularity',
            label: 'Trust it if many people have reposted it',
          },
        ],
      },
      {
        id: 'source-strength',
        version: 1,
        type: GuidedQuestionType.MULTIPLE_SELECT,
        prompt:
          'Which details would make the evidence stronger? Choose every useful check.',
        competency: MediaLiteracyCompetency.EVIDENCE_EVALUATION,
        objectivelyScorable: true,
        correctOptionIds: ['original', 'date-context', 'independent'],
        options: [
          { id: 'original', label: 'The original source, not only a repost' },
          { id: 'date-context', label: 'The date and full context' },
          {
            id: 'independent',
            label: 'Independent sources confirming the same facts',
          },
          { id: 'engagement', label: 'A large number of likes or forwards' },
        ],
      },
      {
        id: 'missing-context',
        version: 1,
        type: GuidedQuestionType.SHORT_TEXT,
        prompt:
          'What date, place, source, comparison, or other context might be missing?',
        competency: MediaLiteracyCompetency.CONTEXT_RECOGNITION,
        objectivelyScorable: false,
        correctOptionIds: [],
        options: [],
      },
      {
        id: 'provisional-verdict',
        version: 1,
        type: GuidedQuestionType.PROVISIONAL_VERDICT,
        prompt:
          'Before seeing Verith’s evidence, what is your provisional view?',
        competency: MediaLiteracyCompetency.EVIDENCE_EVALUATION,
        objectivelyScorable: false,
        correctOptionIds: [],
        options: [
          { id: 'SUPPORTED', label: 'Likely supported' },
          { id: 'CONTRADICTED', label: 'Likely contradicted' },
          { id: 'MIXED', label: 'Mixed or missing important context' },
          { id: 'INSUFFICIENT_EVIDENCE', label: 'Not enough evidence yet' },
        ],
      },
    ];
  }

  private sameSet(left: string[], right: string[]): boolean {
    return (
      left.length === right.length && left.every((item) => right.includes(item))
    );
  }

  private label(value: unknown): string {
    return typeof value === 'string'
      ? value.toLowerCase().replaceAll('_', ' ')
      : 'an undecided view';
  }

  private toResponse(
    session: GuidedInvestigationDocument,
  ): Record<string, unknown> {
    return {
      id: session.id,
      verificationId: session.verificationId.toString(),
      questionSetVersion: session.questionSetVersion,
      status: session.status,
      questions: session.questions.map((question) => ({
        id: question.id,
        version: question.version,
        type: question.type,
        prompt: question.prompt,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
        })),
        competency: question.competency,
        objectivelyScorable: question.objectivelyScorable,
      })),
      responses: session.responses.map((response) => ({
        questionId: response.questionId,
        selectedOptionIds: response.selectedOptionIds,
        text: response.text,
        responseTimeMs: response.responseTimeMs,
        competency: response.competency,
        score: response.score,
        submittedAt: response.submittedAt,
      })),
      feedback: session.feedback.map((item) => ({
        questionId: item.questionId,
        heading: item.heading,
        message: item.message,
        competency: item.competency,
      })),
      submittedAt: session.submittedAt ?? null,
      feedbackGeneratedAt: session.feedbackGeneratedAt ?? null,
    };
  }
}
