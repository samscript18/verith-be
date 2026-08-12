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
  GuidedQuestionCode,
  GuidedQuestionType,
} from '../enums/guided-investigation.enum';
import { InvestigationMode } from '../enums/investigation-mode.enum';
import { Claim } from '../schemas/claim.schema';
import {
  GuidedInvestigation,
  type GuidedInvestigationDocument,
  type GuidedQuestion,
} from '../schemas/guided-investigation.schema';
import type { VerificationDocument } from '../schemas/verification.schema';
import { GUIDED_QUESTION_DEFINITIONS } from '../data/guided-investigation-copy';
import {
  SupportedLanguage,
  supportedLanguageOrEnglish,
} from '../../../shared/language/supported-language';

@Injectable()
export class GuidedInvestigationService {
  static readonly QUESTION_SET_VERSION = 2;

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
    const reportLanguage = supportedLanguageOrEnglish(
      verification.requestedLanguage,
    );
    await this.guided.updateOne(
      { verificationId: verification._id },
      {
        $setOnInsert: {
          verificationId: verification._id,
          userId: verification.userId,
          reportLanguage,
          sourceLanguage: verification.detectedLanguage ?? 'und',
          questionSetVersion: GuidedInvestigationService.QUESTION_SET_VERSION,
          status: GuidedInvestigationStatus.READY,
          questions: this.questions(reportLanguage, firstClaim?.text),
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
      const code = this.questionCode(question);
      if (code === GuidedQuestionCode.PROVISIONAL_VERDICT) {
        const provisional = response?.selectedOptionIds[0];
        const aligned = provisional === report.overallVerdict;
        return {
          questionId: question.id,
          ...this.verdictFeedback(
            session.reportLanguage,
            aligned,
            provisional,
            report.overallVerdict,
          ),
          competency: question.competency,
        };
      }
      if (code === GuidedQuestionCode.MISSING_CONTEXT) {
        const count = report.missingContext.length;
        return {
          questionId: question.id,
          ...this.contextFeedback(session.reportLanguage, count),
          competency: question.competency,
        };
      }
      const correct = response?.score === 1;
      return {
        questionId: question.id,
        ...this.scoredFeedback(
          session.reportLanguage,
          correct,
          code === GuidedQuestionCode.SOURCE_STRENGTH,
        ),
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

  private questions(
    language: SupportedLanguage,
    firstClaim?: string,
  ): GuidedQuestion[] {
    return GUIDED_QUESTION_DEFINITIONS.map((definition) => {
      const copy = definition.translations[language];
      const prompt =
        definition.code === GuidedQuestionCode.RESPONSIBLE_SHARING && firstClaim
          ? `${copy.prompt} ${this.originalClaimLabel(language)} “${firstClaim.slice(0, 280)}”`
          : copy.prompt;
      return {
        id: definition.code,
        code: definition.code,
        version: GuidedInvestigationService.QUESTION_SET_VERSION,
        type: definition.type,
        prompt,
        helperText: copy.helperText,
        competency: definition.competency,
        objectivelyScorable: definition.objectivelyScorable,
        correctOptionIds: definition.correctOptionIds,
        options: definition.optionIds.map((id) => ({
          id,
          label: copy.options[id]!,
        })),
      };
    });
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

  private questionCode(question: GuidedQuestion): GuidedQuestionCode {
    if (question.code) return question.code;
    const legacy: Record<string, GuidedQuestionCode> = {
      'responsible-sharing': GuidedQuestionCode.RESPONSIBLE_SHARING,
      'source-strength': GuidedQuestionCode.SOURCE_STRENGTH,
      'missing-context': GuidedQuestionCode.MISSING_CONTEXT,
      'provisional-verdict': GuidedQuestionCode.PROVISIONAL_VERDICT,
    };
    return legacy[question.id] ?? GuidedQuestionCode.RESPONSIBLE_SHARING;
  }

  private originalClaimLabel(language: SupportedLanguage): string {
    return {
      en: 'Consider this original statement:',
      fr: 'Examinez cette affirmation originale :',
      es: 'Considera esta afirmación original:',
      yo: 'Gbé gbólóhùn ìpilẹ̀ṣẹ̀ yìí yẹ̀ wò:',
    }[language];
  }

  private interfaceCopy(language: SupportedLanguage) {
    return {
      en: {
        titleReady: 'Think first. Then inspect the evidence.',
        titleComplete: 'See how your reasoning developed.',
        introReady:
          'These questions do not contain Verith’s verdict. Record what you notice before opening the completed evidence report.',
        introComplete:
          'Your original answers are preserved. Feedback compares your process with the completed report without changing its finding.',
        submit: 'Save answers and compare',
        submitting: 'Saving your reasoning…',
        incomplete: 'Answer every question before comparing your reasoning.',
      },
      fr: {
        titleReady: 'Réfléchissez d’abord. Examinez ensuite les preuves.',
        titleComplete: 'Voyez comment votre raisonnement a évolué.',
        introReady:
          'Ces questions ne contiennent pas le verdict de Verith. Notez vos observations avant d’ouvrir le rapport de preuves.',
        introComplete:
          'Vos réponses originales sont conservées. Les commentaires comparent votre démarche au rapport sans modifier sa conclusion.',
        submit: 'Enregistrer et comparer',
        submitting: 'Enregistrement de votre raisonnement…',
        incomplete:
          'Répondez à chaque question avant de comparer votre raisonnement.',
      },
      es: {
        titleReady: 'Piensa primero. Después, examina las pruebas.',
        titleComplete: 'Observa cómo evolucionó tu razonamiento.',
        introReady:
          'Estas preguntas no contienen el veredicto de Verith. Anota lo que observas antes de abrir el informe de pruebas.',
        introComplete:
          'Se conservan tus respuestas originales. Los comentarios comparan tu proceso con el informe sin cambiar su conclusión.',
        submit: 'Guardar y comparar',
        submitting: 'Guardando tu razonamiento…',
        incomplete:
          'Responde a todas las preguntas antes de comparar tu razonamiento.',
      },
      yo: {
        titleReady: 'Kọ́kọ́ ronú. Lẹ́yìn náà, ṣàyẹ̀wò ẹ̀rí.',
        titleComplete: 'Wo bí ìrònú rẹ ṣe dàgbà.',
        introReady:
          'Àwọn ìbéèrè yìí kò ní ìdájọ́ Verith. Kọ ohun tí o ṣàkíyèsí kí o tó ṣí ìròyìn ẹ̀rí náà.',
        introComplete:
          'A pa àwọn ìdáhùn rẹ ìpilẹ̀ṣẹ̀ mọ́. Àlàyé náà fi ọ̀nà ìrònú rẹ wé ìròyìn láì yí ìdájọ́ rẹ̀ padà.',
        submit: 'Fi ìdáhùn pamọ́, kí o sì fi wé ẹ̀rí',
        submitting: 'A ń fi ìrònú rẹ pamọ́…',
        incomplete: 'Dáhùn gbogbo ìbéèrè kí o tó fi ìrònú rẹ wé ẹ̀rí.',
      },
    }[language];
  }

  private verdictFeedback(
    language: SupportedLanguage,
    aligned: boolean,
    provisional: unknown,
    verdict: unknown,
  ): { heading: string; message: string } {
    const first = this.label(provisional);
    const final = this.label(verdict);
    const copy: Record<
      SupportedLanguage,
      readonly [heading: string, message: string]
    > = {
      en: aligned
        ? [
            'Your first reading aligned',
            `Your provisional view matched the report’s ${final} finding. The important skill is that you waited for evidence before treating it as settled.`,
          ]
        : [
            'The evidence changed the picture',
            `You first chose ${first}, while the completed evidence supports ${final}. Compare the strongest sources and note what changed your view.`,
          ],
      fr: aligned
        ? [
            'Votre première lecture concordait',
            `Votre avis provisoire correspondait à la conclusion « ${final} ». L’essentiel est d’avoir attendu les preuves avant de la considérer comme établie.`,
          ]
        : [
            'Les preuves ont changé la situation',
            `Vous aviez d’abord choisi « ${first} », alors que les preuves aboutissent à « ${final} ». Comparez les sources les plus solides.`,
          ],
      es: aligned
        ? [
            'Tu primera lectura coincidió',
            `Tu opinión provisional coincidió con la conclusión « ${final} ». La habilidad importante fue esperar las pruebas antes de darla por definitiva.`,
          ]
        : [
            'Las pruebas cambiaron el panorama',
            `Primero elegiste « ${first} », mientras que las pruebas respaldan « ${final} ». Compara las fuentes más sólidas.`,
          ],
      yo: aligned
        ? [
            'Èrò àkọ́kọ́ rẹ bá ẹ̀rí mu',
            `Èrò àkọ́kọ́ rẹ bá ìdájọ́ “${final}” mu. Ohun pàtàkì ni pé o dúró de ẹ̀rí kí o tó gba ọ̀rọ̀ náà gẹ́gẹ́ bí èyí tó dájú.`,
          ]
        : [
            'Ẹ̀rí yí àwòrán náà padà',
            `O kọ́kọ́ yan “${first}”, ṣùgbọ́n ẹ̀rí tó parí tọ́ka sí “${final}”. Fi àwọn orísun tó lágbára jù lọ wé ara wọn.`,
          ],
    };
    const selected = copy[language];
    return { heading: selected[0], message: selected[1] };
  }

  private contextFeedback(
    language: SupportedLanguage,
    count: number,
  ): { heading: string; message: string } {
    const copy: Record<
      SupportedLanguage,
      readonly [heading: string, message: string]
    > = {
      en: count
        ? [
            'Compare the missing context',
            `Verith retained ${count} missing-context finding${count === 1 ? '' : 's'}. Compare them with your note and look for dates, places, baselines, or original framing.`,
          ]
        : [
            'Your context check still matters',
            'The report did not retain a specific missing-context finding. Your observation remains useful reasoning and is not scored as right or wrong.',
          ],
      fr: count
        ? [
            'Comparez le contexte manquant',
            `Verith a retenu ${count} élément${count === 1 ? '' : 's'} de contexte manquant. Comparez-les à votre note.`,
          ]
        : [
            'Votre vérification du contexte reste utile',
            'Le rapport n’a pas retenu de contexte manquant précis. Votre observation reste utile et n’est pas notée comme vraie ou fausse.',
          ],
      es: count
        ? [
            'Compara el contexto ausente',
            `Verith conservó ${count} hallazgo${count === 1 ? '' : 's'} de contexto ausente. Compáralos con tu nota.`,
          ]
        : [
            'Tu revisión del contexto sigue siendo útil',
            'El informe no conservó un hallazgo concreto de contexto ausente. Tu observación sigue siendo útil y no se califica como correcta o incorrecta.',
          ],
      yo: count
        ? [
            'Fi àyíká ọ̀rọ̀ tó sọnù wé ara wọn',
            `Verith pa àbájáde àyíká ọ̀rọ̀ tó sọnù ${count} mọ́. Fi wọ́n wé àkọsílẹ̀ rẹ.`,
          ]
        : [
            'Àyẹ̀wò àyíká ọ̀rọ̀ rẹ ṣì wúlò',
            'Ìròyìn náà kò rí àyíká ọ̀rọ̀ kan pàtó tó sọnù. Àkíyèsí rẹ ṣì wúlò, a kò sì fi ṣe ìdájọ́ pé ó tọ́ tàbí kò tọ́.',
          ],
    };
    const selected = copy[language];
    return { heading: selected[0], message: selected[1] };
  }

  private scoredFeedback(
    language: SupportedLanguage,
    correct: boolean,
    sourceStrength: boolean,
  ): { heading: string; message: string } {
    const copy: Record<
      SupportedLanguage,
      readonly [heading: string, message: string]
    > = {
      en: correct
        ? [
            'Strong verification habit',
            'You chose the evidence-first response. Keep using that pause-and-check habit before sharing.',
          ]
        : [
            'A useful habit to practise',
            sourceStrength
              ? 'Strong evidence needs the original source, its date and context, and independent confirmation. Popularity alone does not establish accuracy.'
              : 'Pause before sharing, inspect the source, and wait for evidence when a claim could affect someone’s decisions.',
          ],
      fr: correct
        ? [
            'Bonne habitude de vérification',
            'Vous avez privilégié les preuves. Continuez à faire cette pause avant de partager.',
          ]
        : [
            'Une habitude utile à pratiquer',
            sourceStrength
              ? 'Des preuves solides exigent la source originale, sa date, son contexte et une confirmation indépendante. La popularité ne suffit pas.'
              : 'Avant de partager, examinez la source et attendez des preuves.',
          ],
      es: correct
        ? [
            'Buen hábito de verificación',
            'Elegiste una respuesta basada primero en las pruebas. Mantén esa pausa antes de compartir.',
          ]
        : [
            'Un hábito útil para practicar',
            sourceStrength
              ? 'Las pruebas sólidas necesitan la fuente original, su fecha, el contexto y una confirmación independiente. La popularidad no demuestra exactitud.'
              : 'Haz una pausa antes de compartir, examina la fuente y espera las pruebas.',
          ],
      yo: correct
        ? [
            'Ìwà àyẹ̀wò tó lágbára',
            'O yan ìdáhùn tó fi ẹ̀rí síwájú. Máa dúró kí o sì yẹ̀ wò kí o tó pín ohun kan.',
          ]
        : [
            'Ìwà tó yẹ kí a máa ṣe',
            sourceStrength
              ? 'Ẹ̀rí tó lágbára nílò orísun àkọ́kọ́, ọjọ́, àyíká ọ̀rọ̀ àti ìmúdájú olómìnira. Gbajúmọ̀ nìkan kò fi òtítọ́ hàn.'
              : 'Dúró kí o tó pín, yẹ orísun wò, kí o sì dúró de ẹ̀rí.',
          ],
    };
    const selected = copy[language];
    return { heading: selected[0], message: selected[1] };
  }

  private toResponse(
    session: GuidedInvestigationDocument,
  ): Record<string, unknown> {
    return {
      id: session.id,
      verificationId: session.verificationId.toString(),
      questionSetVersion: session.questionSetVersion,
      reportLanguage: session.reportLanguage,
      sourceLanguage: session.sourceLanguage,
      copy: this.interfaceCopy(session.reportLanguage),
      status: session.status,
      questions: session.questions.map((question) => ({
        id: question.id,
        code: question.code ?? this.questionCode(question),
        version: question.version,
        type: question.type,
        prompt: question.prompt,
        helperText: question.helperText ?? null,
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
