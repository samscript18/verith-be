import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Joi from 'joi';
import type { DailyChallengeConfig } from '../../../shared/config';
import { AiCapability } from '../../ai/enums/ai-capability.enum';
import { AiRouterService } from '../../ai/services/ai-router.service';
import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import {
  ChallengeGenerationMode,
  ChallengeGenerationValidationStatus,
  DailyChallengeCompetency,
  DailyChallengeTopic,
} from '../enums/daily-challenge.enum';
import type {
  DailyChallengeBlueprint,
  DailyChallengeGenerator,
  DailyChallengeGeneratorResult,
  GeneratedDailyChallenge,
} from '../interfaces/daily-challenge.interface';

const topicValues = Object.values(DailyChallengeTopic);
const competencyValues = Object.values(DailyChallengeCompetency);

const outputValidator = Joi.object<GeneratedDailyChallenge>({
  title: Joi.string().trim().min(3).max(140).required(),
  description: Joi.string().trim().min(20).max(1500).required(),
  scenario: Joi.string().trim().min(20).max(3000).required(),
  questions: Joi.array()
    .length(10)
    .items(
      Joi.object({
        type: Joi.string().valid(QuizQuestionType.SINGLE_CHOICE).required(),
        prompt: Joi.string().trim().min(25).max(2000).required(),
        options: Joi.array()
          .min(3)
          .max(4)
          .items(
            Joi.object({
              id: Joi.string().trim().min(1).max(20).required(),
              text: Joi.string().trim().min(2).max(500).required(),
            }),
          )
          .required(),
        correctOptionId: Joi.string().trim().min(1).max(20).required(),
        explanation: Joi.string().trim().min(20).max(2000).required(),
        competency: Joi.string()
          .valid(...competencyValues)
          .required(),
        secondaryCompetencies: Joi.array()
          .items(Joi.string().valid(...competencyValues))
          .max(3)
          .default([]),
        topic: Joi.string()
          .valid(...topicValues)
          .required(),
        educationalObjective: Joi.string().trim().min(10).max(500).required(),
      }),
    )
    .required(),
}).required();

const outputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'scenario', 'questions'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    scenario: { type: 'string' },
    questions: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'type',
          'prompt',
          'options',
          'correctOptionId',
          'explanation',
          'competency',
          'topic',
          'educationalObjective',
        ],
        properties: {
          type: { type: 'string', enum: [QuizQuestionType.SINGLE_CHOICE] },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            minItems: 3,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'text'],
              properties: { id: { type: 'string' }, text: { type: 'string' } },
            },
          },
          correctOptionId: { type: 'string' },
          explanation: { type: 'string' },
          competency: { type: 'string', enum: competencyValues },
          secondaryCompetencies: {
            type: 'array',
            items: { type: 'string', enum: competencyValues },
            maxItems: 3,
          },
          topic: { type: 'string', enum: topicValues },
          educationalObjective: { type: 'string' },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

@Injectable()
export class AiDailyChallengeGenerator implements DailyChallengeGenerator {
  private readonly config: DailyChallengeConfig;

  constructor(
    private readonly ai: AiRouterService,
    configService: ConfigService,
  ) {
    this.config =
      configService.getOrThrow<DailyChallengeConfig>('dailyChallenge');
  }

  async generate(
    blueprint: DailyChallengeBlueprint,
  ): Promise<DailyChallengeGeneratorResult> {
    const result = await this.ai.execute<GeneratedDailyChallenge>({
      capability: AiCapability.DAILY_CHALLENGE_GENERATION,
      promptKey: 'learning.daily-challenge-generation',
      variables: { blueprint: JSON.stringify(blueprint) },
      outputSchemaName: 'generated_daily_challenge',
      outputSchemaVersion: 'daily-challenge.v1',
      outputJsonSchema,
      outputValidator,
      requestId: `daily-challenge:${blueprint.date}`,
      temperature: 0.65,
      maxOutputTokens: 7000,
      maxProviderCalls: this.config.maxAiAttempts,
      allowSchemaCorrection: false,
    });
    return {
      challenge: result.output,
      generation: {
        mode: ChallengeGenerationMode.AI,
        provider: result.provider,
        model: result.model,
        generatedAt: new Date(),
        generatorVersion: 'daily-challenge-ai-v1',
        validationVersion: 'daily-challenge-validator-v1',
        validationStatus: ChallengeGenerationValidationStatus.PASSED,
        topicCoverage: [
          ...new Set(result.output.questions.map((question) => question.topic)),
        ],
        competencyCoverage: [
          ...new Set(
            result.output.questions.map((question) => question.competency),
          ),
        ],
      },
    };
  }
}
