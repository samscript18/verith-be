import { registerAs } from '@nestjs/config';

export interface UsageConfig {
  freeDailyLimit: number;
  videoCost: number;
}

export default registerAs('usage', (): UsageConfig => ({
  freeDailyLimit: 3,
  videoCost: 2,
}));
