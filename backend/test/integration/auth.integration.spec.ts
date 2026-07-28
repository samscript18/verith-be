import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import type { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/api/auth/services/auth.service';
import { TokenService } from '../../src/api/auth/services/token.service';
import { AuthenticationException } from '../../src/core/exceptions';

describe('Authentication persistence (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let authService: AuthService;
  let tokenService: TokenService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    authService = moduleRef.get(AuthService);
    tokenService = moduleRef.get(TokenService);
  });

  afterAll(async () => {
    if (connection) {
      await Promise.all([
        connection.collection('auth_tokens').deleteMany({}),
        connection.collection('sessions').deleteMany({}),
        connection.collection('users').deleteMany({}),
      ]);
    }
    if (moduleRef) await moduleRef.close();
  });

  it('hashes credentials, rotates refresh tokens, and detects reuse', async () => {
    const password = 'Correct Horse Battery Staple 42!';
    const registration = await authService.register({
      email: 'integration@example.com',
      username: 'integration_user',
      password,
    });

    expect(registration.emailDelivery.state).toBe('NOT_CONFIGURED');
    const storedUser = await connection
      .collection('users')
      .findOne({ emailNormalized: 'integration@example.com' });
    expect(storedUser).not.toBeNull();
    if (!storedUser) throw new Error('Registration did not persist a user');
    expect(storedUser?.passwordHash).not.toBe(password);
    expect(
      await bcrypt.compare(password, String(storedUser?.passwordHash)),
    ).toBe(true);

    await connection
      .collection('auth_tokens')
      .deleteMany({ userId: storedUser._id });
    const verificationToken = 'integration-verification-token-000000000000';
    await connection.collection('auth_tokens').insertOne({
      userId: storedUser._id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: tokenService.hash(verificationToken),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await authService.verifyEmail(verificationToken);
    await expect(
      authService.verifyEmail(verificationToken),
    ).rejects.toMatchObject<Partial<AuthenticationException>>({
      code: 'AUTH_TOKEN_INVALID',
    });

    const login = await authService.login(
      {
        identifier: 'integration@example.com',
        password,
        deviceName: 'integration-test',
      },
      { ipHash: '127.0.0.1', userAgentSummary: 'jest' },
    );
    const storedSession = await connection
      .collection('sessions')
      .findOne({ userId: storedUser._id });
    expect(storedSession?.refreshTokenHash).not.toBe(login.refreshToken);
    expect(String(storedSession?.ipHash)).not.toBe('127.0.0.1');

    const rotated = await authService.refresh(login.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject<
      Partial<AuthenticationException>
    >({
      code: 'REFRESH_TOKEN_REUSE_DETECTED',
    });
    await expect(
      authService.refresh(rotated.refreshToken),
    ).rejects.toMatchObject<Partial<AuthenticationException>>({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});
