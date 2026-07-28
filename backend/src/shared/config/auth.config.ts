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
}

export default registerAs('auth', (): AuthConfig => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshExpiresDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 30),
  emailVerificationTtlMinutes: Number(
    process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES ?? 30,
  ),
  passwordResetTtlMinutes: Number(
    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 20,
  ),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  hashingPepper: process.env.HASHING_PEPPER ?? '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite:
    (process.env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none') ?? 'lax',
  ...(process.env.COOKIE_DOMAIN
    ? { cookieDomain: process.env.COOKIE_DOMAIN }
    : {}),
}));
