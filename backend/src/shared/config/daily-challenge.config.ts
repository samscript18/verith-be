import { registerAs } from '@nestjs/config';

export interface DailyChallengeConfig {
  aiEnabled: boolean;
  autoPublish: boolean;
  duplicateWindowDays: number;
  maxAiAttempts: number;
  similarityThreshold: number;
}

const booleanValue = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : value.toLowerCase() === 'true';

export default registerAs('dailyChallenge', (): DailyChallengeConfig => ({
  aiEnabled: booleanValue(process.env.DAILY_CHALLENGE_AI_ENABLED, true),
  autoPublish: booleanValue(process.env.DAILY_CHALLENGE_AUTO_PUBLISH, true),
  duplicateWindowDays: Number(
    process.env.DAILY_CHALLENGE_DUPLICATE_WINDOW_DAYS ?? 90,
  ),
  maxAiAttempts: Number(process.env.DAILY_CHALLENGE_MAX_AI_ATTEMPTS ?? 2),
  similarityThreshold: Number(
    process.env.DAILY_CHALLENGE_SIMILARITY_THRESHOLD ?? 0.85,
  ),
}));
