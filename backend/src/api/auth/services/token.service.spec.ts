import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

describe('TokenService', () => {
  const config = {
    accessSecret: 'a'.repeat(32),
    accessExpiresIn: '15m',
    refreshExpiresDays: 30,
    emailVerificationTtlMinutes: 30,
    passwordResetTtlMinutes: 20,
    bcryptRounds: 12,
    hashingPepper: 'b'.repeat(32),
    cookieSecure: false,
    cookieSameSite: 'lax' as const,
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(config),
  } as unknown as ConfigService;

  it('creates opaque, non-repeating tokens', () => {
    const service = new TokenService(new JwtService(), configService);
    const first = service.createOpaqueToken();
    const second = service.createOpaqueToken();

    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(64);
  });

  it('hashes tokens deterministically with the configured pepper', () => {
    const service = new TokenService(new JwtService(), configService);
    expect(service.hash('token')).toEqual(service.hash('token'));
    expect(service.hash('token')).not.toEqual(service.hash('other'));
  });

  it('issues verifiable access JWTs', async () => {
    const jwtService = new JwtService();
    const service = new TokenService(jwtService, configService);
    const token = await service.issueAccessToken({
      userId: 'user-id',
      sessionId: 'session-id',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });
    const payload = await jwtService.verifyAsync<{ sub: string; sid: string }>(
      token,
      {
        secret: config.accessSecret,
        issuer: 'verith',
        audience: 'verith-api',
      },
    );

    expect(payload).toMatchObject({ sub: 'user-id', sid: 'session-id' });
  });
});
