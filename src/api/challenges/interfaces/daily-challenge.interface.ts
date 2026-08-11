import type { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import type {
  ChallengeGenerationMode,
  ChallengeGenerationValidationStatus,
  DailyChallengeCompetency,
  DailyChallengeTopic,
} from '../enums/daily-challenge.enum';

export interface DailyChallengeBlueprint {
  date: string;
  difficulty: 'BEGINNER';
  topicFocus: DailyChallengeTopic[];
  competencyTargets: DailyChallengeCompetency[];
  questionCount: 10;
  language: 'en';
  theme: string;
}

export interface GeneratedDailyQuestion {
  id?: string;
  type: QuizQuestionType;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  competency: DailyChallengeCompetency;
  secondaryCompetencies?: DailyChallengeCompetency[];
  topic: DailyChallengeTopic;
  educationalObjective: string;
}

export interface GeneratedDailyChallenge {
  title: string;
  description: string;
  scenario: string;
  questions: GeneratedDailyQuestion[];
}

export interface DailyChallengeGenerationMetadata {
  mode: ChallengeGenerationMode;
  provider?: string;
  model?: string;
  generatedAt: Date;
  generatorVersion: string;
  validationVersion: string;
  validationStatus: ChallengeGenerationValidationStatus;
  fallbackReason?: string;
  topicCoverage: DailyChallengeTopic[];
  competencyCoverage: DailyChallengeCompetency[];
}

export interface DailyChallengeGeneratorResult {
  challenge: GeneratedDailyChallenge;
  generation: DailyChallengeGenerationMetadata;
}

export interface DailyChallengeGenerator {
  generate(
    blueprint: DailyChallengeBlueprint,
  ): Promise<DailyChallengeGeneratorResult>;
}
