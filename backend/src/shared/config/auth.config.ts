import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  accessSecret: string;
  accessExpiresIn: string;
  refreshExpiresDays: number;
  emailVerificationTtlMinutes: number;
  passwordResetTtlMinutes: number;
  bcryptRounds: number;
  hashingPepper: string;
  cookieSecure: boolean;
  cookieSameSite: 'strict' | 'lax' | 'none';
  cookieDomain?: string;
  googleClientId?: string;
}

export default registerAs('auth', (): AuthConfig => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  return {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessExpiresIn: '15m',
    refreshExpiresDays: 30,
    emailVerificationTtlMinutes: 30,
    passwordResetTtlMinutes: 20,
    bcryptRounds: 12,
    hashingPepper: process.env.HASHING_PEPPER ?? '',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    cookieSameSite:
      (process.env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none') ?? 'lax',
    ...(process.env.COOKIE_DOMAIN
      ? { cookieDomain: process.env.COOKIE_DOMAIN }
      : {}),
    ...(googleClientId ? { googleClientId } : {}),
  };
});
