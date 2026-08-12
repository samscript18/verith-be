import { registerAs } from '@nestjs/config';

export interface DailyChallengeConfig {
  aiEnabled: boolean;
  autoPublish: boolean;
  duplicateWindowDays: number;
  maxAiAttempts: number;
  similarityThreshold: number;
}

export default registerAs('dailyChallenge', (): DailyChallengeConfig => ({
  aiEnabled: true,
  autoPublish: true,
  duplicateWindowDays: 90,
  maxAiAttempts: 2,
  similarityThreshold: 0.85,
}));
