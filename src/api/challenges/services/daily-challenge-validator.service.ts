import { Injectable } from '@nestjs/common';
import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import {
  DailyChallengeCompetency,
  DailyChallengeTopic,
} from '../enums/daily-challenge.enum';
import type {
  DailyChallengeBlueprint,
  GeneratedDailyChallenge,
  GeneratedDailyQuestion,
} from '../interfaces/daily-challenge.interface';
import {
  normalizeQuestionPrompt,
  questionSignature,
} from '../utils/question-similarity';

export class DailyChallengeContentError extends Error {
  constructor(
    readonly safeCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'DailyChallengeContentError';
  }
}

@Injectable()
export class DailyChallengeValidator {
  private readonly unsafePatterns = [
    /\bhow to (?:kill|harm|steal|hack|defraud)\b/i,
    /\b(?:suicide|self-harm) instructions\b/i,
    /\bvote for\b/i,
    /\bguaranteed (?:profit|return|cure)\b/i,
  ];

  validate(
    value: GeneratedDailyChallenge,
    blueprint: DailyChallengeBlueprint,
  ): GeneratedDailyChallenge {
    if (!this.validText(value.title, 3, 140))
      throw new DailyChallengeContentError(
        'TITLE_INVALID',
        'The generated title is invalid',
      );
    if (!this.validText(value.description, 20, 1500))
      throw new DailyChallengeContentError(
        'DESCRIPTION_INVALID',
        'The generated description is invalid',
      );
    if (!this.validText(value.scenario, 20, 3000))
      throw new DailyChallengeContentError(
        'SCENARIO_INVALID',
        'The generated scenario is invalid',
      );
    if (
      !Array.isArray(value.questions) ||
      value.questions.length !== blueprint.questionCount
    )
      throw new DailyChallengeContentError(
        'QUESTION_COUNT_INVALID',
        'Daily Practice requires exactly ten questions',
      );

    const prompts = new Set<string>();
    const openings = new Map<string, number>();
    const questions = value.questions.map((question, index) => {
      const normalized = this.validateQuestion(question, blueprint);
      if (prompts.has(normalized))
        throw new DailyChallengeContentError(
          'QUESTION_DUPLICATE_INTERNAL',
          'Generated questions repeat within the same challenge',
        );
      prompts.add(normalized);
      const opening = normalized.split(' ').slice(0, 5).join(' ');
      openings.set(opening, (openings.get(opening) ?? 0) + 1);
      return {
        ...question,
        id: `${blueprint.date}-q${String(index + 1).padStart(2, '0')}`,
      };
    });
    if ([...openings.values()].some((count) => count > 2))
      throw new DailyChallengeContentError(
        'QUESTION_OPENINGS_REPETITIVE',
        'Too many questions use the same opening structure',
      );
    this.assertSafe([
      value.title,
      value.description,
      value.scenario,
      ...questions.flatMap((question) => [
        question.prompt,
        question.explanation,
        ...question.options.map((option) => option.text),
      ]),
    ]);
    return { ...value, questions };
  }

  toStoredQuestion(question: GeneratedDailyQuestion) {
    return {
      id: question.id!,
      type: question.type,
      prompt: question.prompt.trim(),
      options: question.options.map((option) => ({
        id: option.id.trim(),
        text: option.text.trim(),
      })),
      correctOptionIds: [question.correctOptionId],
      explanation: question.explanation.trim(),
      competency: question.competency,
      secondaryCompetencies: [...new Set(question.secondaryCompetencies ?? [])],
      topic: question.topic,
      educationalObjective: question.educationalObjective.trim(),
      normalizedSignature: questionSignature(question.prompt),
    };
  }

  private validateQuestion(
    question: GeneratedDailyQuestion,
    blueprint: DailyChallengeBlueprint,
  ): string {
    if (question.type !== QuizQuestionType.SINGLE_CHOICE)
      throw new DailyChallengeContentError(
        'QUESTION_TYPE_INVALID',
        'Daily Practice currently supports single-choice questions only',
      );
    if (!this.validText(question.prompt, 25, 2000))
      throw new DailyChallengeContentError(
        'QUESTION_PROMPT_INVALID',
        'A generated question prompt is invalid',
      );
    if (
      !Array.isArray(question.options) ||
      question.options.length < 3 ||
      question.options.length > 4
    )
      throw new DailyChallengeContentError(
        'QUESTION_OPTIONS_INVALID',
        'Each question requires three or four options',
      );
    const optionIds = question.options.map((option) => option.id.trim());
    const optionText = question.options.map((option) =>
      normalizeQuestionPrompt(option.text),
    );
    if (
      optionIds.some((id) => !id) ||
      new Set(optionIds).size !== optionIds.length ||
      optionText.some((text) => !text) ||
      new Set(optionText).size !== optionText.length
    )
      throw new DailyChallengeContentError(
        'QUESTION_OPTIONS_DUPLICATE',
        'Question options must be non-empty and unique',
      );
    if (!optionIds.includes(question.correctOptionId))
      throw new DailyChallengeContentError(
        'QUESTION_ANSWER_INVALID',
        'The correct answer must reference an existing option',
      );
    if (
      !this.validText(question.explanation, 20, 2000) ||
      !this.validText(question.educationalObjective, 10, 500)
    )
      throw new DailyChallengeContentError(
        'QUESTION_EXPLANATION_INVALID',
        'Every question requires an educational explanation and objective',
      );
    if (
      !Object.values(DailyChallengeTopic).includes(question.topic) ||
      !blueprint.topicFocus.includes(question.topic)
    )
      throw new DailyChallengeContentError(
        'QUESTION_TOPIC_INVALID',
        'A question uses a topic outside today’s blueprint',
      );
    if (
      !Object.values(DailyChallengeCompetency).includes(question.competency) ||
      !blueprint.competencyTargets.includes(question.competency)
    )
      throw new DailyChallengeContentError(
        'QUESTION_COMPETENCY_INVALID',
        'A question uses a competency outside today’s blueprint',
      );
    return normalizeQuestionPrompt(question.prompt);
  }

  private validText(
    value: unknown,
    minimum: number,
    maximum: number,
  ): value is string {
    return (
      typeof value === 'string' &&
      value.trim().length >= minimum &&
      value.trim().length <= maximum
    );
  }

  private assertSafe(values: string[]) {
    if (
      values.some((value) =>
        this.unsafePatterns.some((pattern) => pattern.test(value)),
      )
    )
      throw new DailyChallengeContentError(
        'CONTENT_SAFETY_REJECTED',
        'Generated content failed the local safety policy',
      );
  }
}
