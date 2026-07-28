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
  maxTextLength: Number(process.env.VERIFICATION_MAX_TEXT_LENGTH ?? 50000),
  maxClaims: Number(process.env.VERIFICATION_MAX_CLAIMS ?? 20),
  maxQueriesPerClaim: Number(
    process.env.VERIFICATION_MAX_SEARCH_QUERIES_PER_CLAIM ?? 5,
  ),
  urlTimeoutMs: Number(process.env.URL_FETCH_TIMEOUT_MS ?? 15000),
  urlMaxBytes: Number(process.env.URL_FETCH_MAX_BYTES ?? 2097152),
  urlMaxRedirects: Number(process.env.URL_FETCH_MAX_REDIRECTS ?? 3),
  userAgent:
    process.env.URL_FETCH_USER_AGENT ??
    'VerithBot/1.0 (+https://verith.example/bot)',
}));
