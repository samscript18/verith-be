import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type {
  AuthService,
  AuthenticationResult,
} from '../services/auth.service';
import type { TokenService } from '../services/token.service';
import type { AuthUser } from '../interfaces/auth-user.interface';

describe('AuthController browser cookies', () => {
  const authentication: AuthenticationResult = {
    accessToken: 'access-token',
    accessTokenExpiresIn: '15m',
    refreshToken: 'refresh-token',
    user: { id: 'user-id' },
  };

  const authService = {
    login: jest.fn().mockResolvedValue(authentication),
    logout: jest.fn().mockResolvedValue(undefined),
    logoutAll: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  const tokenService = {
    createOpaqueToken: jest.fn().mockReturnValue('csrf-token'),
  } as unknown as TokenService;
  const configService = {
    getOrThrow: jest.fn().mockReturnValue({
      accessExpiresIn: '15m',
      bcryptRounds: 12,
      cookieSecure: true,
      cookieSameSite: 'lax',
      refreshExpiresDays: 30,
    }),
  } as unknown as ConfigService;

  const controller = new AuthController(
    authService,
    tokenService,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the secret refresh cookie narrow and exposes CSRF at the app path', async () => {
    const cookie = jest.fn();
    const response = {
      cookie,
    } as unknown as Response;
    const request = {
      header: jest.fn().mockReturnValue('test browser'),
      ip: '127.0.0.1',
    } as unknown as Request;

    const delivered = await controller.login(
      { identifier: 'person@example.com', password: 'valid-password' },
      request,
      undefined,
      response,
    );

    expect(cookie).toHaveBeenCalledWith(
      'verith_refresh',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1/auth',
      }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'verith_csrf',
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        path: '/',
      }),
    );
    expect(delivered).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        csrfToken: 'csrf-token',
      }),
    );
  });

  it('clears both browser cookies on logout', async () => {
    const clearCookie = jest.fn();
    const response = {
      clearCookie,
    } as unknown as Response;
    const user = {
      sessionId: 'session-id',
      userId: 'user-id',
    } as AuthUser;

    await controller.logout(user, response);

    expect(clearCookie).toHaveBeenCalledWith(
      'verith_refresh',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1/auth',
      }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'verith_csrf',
      expect.objectContaining({
        httpOnly: false,
        path: '/',
      }),
    );
  });
});
