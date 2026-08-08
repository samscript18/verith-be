import { registerAs } from '@nestjs/config';

export interface ProcessingConfig {
  maxTextLength: number;
  maxClaims: number;
  maxQueriesPerClaim: number;
  urlTimeoutMs: number;
  urlMaxBytes: number;
  urlMaxRedirects: number;
  userAgent: string;
}

export default registerAs('processing', (): ProcessingConfig => ({
  maxTextLength: 50000,
  maxClaims: Number(process.env.MAX_CLAIMS ?? 8),
  maxQueriesPerClaim: Number(process.env.MAX_QUERIES_PER_CLAIM ?? 2),
  urlTimeoutMs: 15000,
  urlMaxBytes: 2097152,
  urlMaxRedirects: 3,
  userAgent: 'VerithBot/1.0 (+https://verith.example/bot)',
}));
