import { Injectable } from '@nestjs/common';
import { dailyChallengeContent } from '../data/daily-challenge-bank';
import {
  ChallengeGenerationMode,
  ChallengeGenerationValidationStatus,
} from '../enums/daily-challenge.enum';
import type {
  DailyChallengeBlueprint,
  DailyChallengeGenerator,
  DailyChallengeGeneratorResult,
} from '../interfaces/daily-challenge.interface';

@Injectable()
export class TemplateDailyChallengeGenerator implements DailyChallengeGenerator {
  generate(
    blueprint: DailyChallengeBlueprint,
    fallbackReason?: string,
  ): Promise<DailyChallengeGeneratorResult> {
    const content = dailyChallengeContent(blueprint.date);
    return Promise.resolve({
      challenge: {
        title: `${blueprint.theme}: ${content.topic.name}`,
        description: content.content,
        scenario: content.scenario,
        questions: content.questions.map((question, index) => ({
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          options: question.options.map((option) => ({ ...option })),
          correctOptionId: question.correctOptionIds[0]!,
          explanation: question.explanation,
          competency: blueprint.competencyTargets[index]!,
          secondaryCompetencies: question.secondaryCompetencies,
          topic: question.topic,
          educationalObjective: question.educationalObjective,
        })),
      },
      generation: {
        mode: ChallengeGenerationMode.TEMPLATE,
        generatedAt: new Date(),
        generatorVersion: 'daily-challenge-bank-v2',
        validationVersion: 'daily-challenge-validator-v1',
        validationStatus: ChallengeGenerationValidationStatus.PASSED,
        ...(fallbackReason ? { fallbackReason } : {}),
        topicCoverage: [...blueprint.topicFocus],
        competencyCoverage: [...new Set(blueprint.competencyTargets)],
      },
    });
  }
}
