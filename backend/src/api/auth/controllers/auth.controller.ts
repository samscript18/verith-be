import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthConfig } from '../../../shared/config';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { AuthenticationException } from '../../../core/exceptions';
import type { AuthUser } from '../interfaces/auth-user.interface';
import {
  ChangePasswordDto,
  EmailDto,
  GoogleAuthConfigDto,
  GoogleAuthDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from '../dto/auth.dto';
import {
  AuthService,
  type AuthenticationResult,
} from '../services/auth.service';
import { TokenService } from '../services/token.service';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';

const AUTH_COOKIE_PATH = '/api/v1/auth';
const CSRF_COOKIE_PATH = '/';

type DeliveredAuthentication = Omit<AuthenticationResult, 'refreshToken'> & {
  refreshToken?: string;
  csrfToken?: string;
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly authConfig: AuthConfig;

  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.getOrThrow<AuthConfig>('auth');
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a user and request email verification' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('google/config')
  @ApiOperation({ summary: 'Get the public Google authentication client' })
  @ApiOkResponse({ type: GoogleAuthConfigDto })
  googleConfiguration(): GoogleAuthConfigDto {
    return this.authService.googleConfiguration();
  }

  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or log in with a Google ID token' })
  async googleAuthentication(
    @Body() dto: GoogleAuthDto,
    @Req() request: Request,
    @Headers('x-client-type') clientType: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeliveredAuthentication> {
    const userAgentSummary = request.header('user-agent')?.slice(0, 300);
    const result = await this.authService.authenticateWithGoogle(dto, {
      ...(request.ip ? { ipHash: request.ip } : {}),
      ...(userAgentSummary ? { userAgentSummary } : {}),
    });
    return this.deliverAuthentication(response, result, clientType);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyEmail(@Body() dto: TokenDto): Promise<void> {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() dto: EmailDto): Promise<void> {
    await this.authService.resendVerification(dto.email);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Headers('x-client-type') clientType: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeliveredAuthentication> {
    const userAgentSummary = request.header('user-agent')?.slice(0, 300);
    const result = await this.authService.login(dto, {
      ...(request.ip ? { ipHash: request.ip } : {}),
      ...(userAgentSummary ? { userAgentSummary } : {}),
    });
    return this.deliverAuthentication(response, result, clientType);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('verith_refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Headers('x-client-type') clientType: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeliveredAuthentication> {
    const cookieToken = request.cookies as Record<string, string> | undefined;
    const token = dto.token ?? cookieToken?.verith_refresh;
    if (!token) {
      throw new AuthenticationException(
        'Refresh token is required',
        'REFRESH_TOKEN_REQUIRED',
      );
    }
    if (
      !dto.token &&
      (!csrfHeader ||
        !cookieToken?.verith_csrf ||
        !this.tokenService.secureEqual(csrfHeader, cookieToken.verith_csrf))
    ) {
      throw new AuthenticationException(
        'CSRF validation failed',
        'CSRF_VALIDATION_FAILED',
      );
    }
    return this.deliverAuthentication(
      response,
      await this.authService.refresh(token),
      clientType,
    );
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: EmailDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user.userId, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(user.sessionId);
    this.clearBrowserCookies(response);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.userId);
    this.clearBrowserCookies(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.userId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
  ): Promise<void> {
    return this.authService.revokeSession(user.userId, sessionId);
  }

  private deliverAuthentication(
    response: Response,
    result: AuthenticationResult,
    clientType: string | undefined,
  ): DeliveredAuthentication {
    if (clientType === 'mobile') return result;
    const csrfToken = this.tokenService.createOpaqueToken();
    response.cookie('verith_refresh', result.refreshToken, {
      httpOnly: true,
      secure: this.authConfig.cookieSecure,
      sameSite: this.authConfig.cookieSameSite,
      path: AUTH_COOKIE_PATH,
      maxAge: this.authConfig.refreshExpiresDays * 24 * 60 * 60 * 1000,
      ...(this.authConfig.cookieDomain
        ? { domain: this.authConfig.cookieDomain }
        : {}),
    });
    response.cookie('verith_csrf', csrfToken, {
      httpOnly: false,
      secure: this.authConfig.cookieSecure,
      sameSite: this.authConfig.cookieSameSite,
      path: CSRF_COOKIE_PATH,
      maxAge: this.authConfig.refreshExpiresDays * 24 * 60 * 60 * 1000,
      ...(this.authConfig.cookieDomain
        ? { domain: this.authConfig.cookieDomain }
        : {}),
    });
    return {
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      csrfToken,
      user: result.user,
    };
  }

  private clearBrowserCookies(response: Response): void {
    const sharedOptions = {
      secure: this.authConfig.cookieSecure,
      sameSite: this.authConfig.cookieSameSite,
      ...(this.authConfig.cookieDomain
        ? { domain: this.authConfig.cookieDomain }
        : {}),
    } as const;
    response.clearCookie('verith_refresh', {
      ...sharedOptions,
      httpOnly: true,
      path: AUTH_COOKIE_PATH,
    });
    response.clearCookie('verith_csrf', {
      ...sharedOptions,
      httpOnly: false,
      path: CSRF_COOKIE_PATH,
    });
  }
}
