import { registerAs } from '@nestjs/config';

export interface UsageConfig {
  freeDailyLimit: number;
  videoCost: number;
}

export default registerAs('usage', (): UsageConfig => ({
  freeDailyLimit: Number(process.env.FREE_DAILY_INVESTIGATION_LIMIT ?? 3),
  videoCost: Number(process.env.VIDEO_INVESTIGATION_COST ?? 2),
}));
