import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  AuthenticationException,
  ConflictException,
  ExternalProviderException,
} from '../../../core/exceptions';
import {
  DomainEventName,
  SecurityAlertKind,
} from '../../../core/events/domain-event.contracts';
import { DomainEventPublisher } from '../../../core/events/domain-event-publisher.service';
import type { AppConfig, AuthConfig } from '../../../shared/config';
import {
  MailService,
  type MailDeliveryResult,
} from '../../../shared/mail/mail.service';
import { parseUserAgent } from '../../../shared/utils/user-agent';
import { AuthProvider } from '../../users/enums/auth-provider.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import type { UserDocument } from '../../users/schemas/user.schema';
import { UsersService } from '../../users/users.service';
import type {
  ChangePasswordDto,
  GoogleAuthDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from '../dto/auth.dto';
import { GoogleAuthIntent } from '../dto/auth.dto';
import {
  AuthToken,
  AuthTokenPurpose,
  type AuthTokenDocument,
} from '../schemas/auth-token.schema';
import { Session, type SessionDocument } from '../schemas/session.schema';
import { TokenService } from './token.service';

export interface SessionContext {
  ipHash?: string;
  userAgentSummary?: string;
}

export interface AuthenticationResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  user: Record<string, unknown>;
}

const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 3 * 60 * 1000;
const CONCURRENT_REFRESH_GRACE_MS = 5_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();
  private readonly authConfig: AuthConfig;
  private readonly appConfig: AppConfig;

  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    @InjectModel(AuthToken.name)
    private readonly authTokenModel: Model<AuthToken>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly domainEvents: DomainEventPublisher,
    configService: ConfigService,
  ) {
    this.authConfig = configService.getOrThrow<AuthConfig>('auth');
    this.appConfig = configService.getOrThrow<AppConfig>('app');
  }

  async register(dto: RegisterDto): Promise<{
    user: Record<string, unknown>;
    emailDelivery: MailDeliveryResult;
  }> {
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.authConfig.bcryptRounds,
    );
    const user = await this.usersService.create({
      email: dto.email.trim(),
      username: dto.username.trim(),
      passwordHash,
      ...(dto.displayName ? { displayName: dto.displayName.trim() } : {}),
    });
    const emailDelivery = await this.issueEmailVerification(user);
    return { user: this.usersService.toPrivateProfile(user), emailDelivery };
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.consumeToken(
      rawToken,
      AuthTokenPurpose.EMAIL_VERIFICATION,
    );
    await this.usersService.activate(token.userId);
  }

  async resendVerification(email: string): Promise<MailDeliveryResult | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return null;
    const recentlyIssued = await this.authTokenModel.exists({
      userId: user._id,
      purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
      consumedAt: { $exists: false },
      createdAt: {
        $gt: new Date(Date.now() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS),
      },
    });
    if (recentlyIssued) return null;
    return this.issueEmailVerification(user);
  }

  async login(
    dto: LoginDto,
    context: SessionContext,
  ): Promise<AuthenticationResult> {
    const user = await this.usersService.findByIdentifierWithPassword(
      dto.identifier,
    );
    if (
      user &&
      (user.authProvider ?? AuthProvider.LOCAL) === AuthProvider.GOOGLE
    ) {
      throw new AuthenticationException(
        'This account uses Google authentication',
        'USE_GOOGLE_SIGN_IN',
      );
    }
    const passwordValid = Boolean(
      user?.passwordHash &&
      (await bcrypt.compare(dto.password, user.passwordHash)),
    );
    if (!user || !passwordValid) {
      throw new AuthenticationException(
        'Invalid email, username, or password',
        'INVALID_CREDENTIALS',
      );
    }
    this.assertLoginAllowed(user);
    const result = await this.createSession(user, {
      ...context,
      ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
    });
    await this.usersService.recordLogin(user._id);
    return result;
  }

  googleConfiguration(): { enabled: boolean; clientId: string | null } {
    return {
      enabled: Boolean(this.authConfig.googleClientId),
      clientId: this.authConfig.googleClientId ?? null,
    };
  }

  async authenticateWithGoogle(
    dto: GoogleAuthDto,
    context: SessionContext,
  ): Promise<AuthenticationResult> {
    const clientId = this.authConfig.googleClientId;
    if (!clientId) {
      throw new ExternalProviderException(
        'Google authentication is not configured',
        'GOOGLE_AUTH_NOT_CONFIGURED',
      );
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AuthenticationException(
        'Google could not verify this identity',
        'GOOGLE_CREDENTIAL_INVALID',
      );
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AuthenticationException(
        'Google did not provide a verified account identity',
        'GOOGLE_IDENTITY_INCOMPLETE',
      );
    }

    let user = await this.usersService.findByGoogleSubject(payload.sub);
    if (dto.intent === GoogleAuthIntent.REGISTER) {
      if (user) {
        throw new ConflictException(
          'This Google account already has a Verith workspace',
          'GOOGLE_ACCOUNT_ALREADY_EXISTS',
        );
      }
      const emailAccount = await this.usersService.findByEmail(payload.email);
      if (emailAccount) {
        throw new ConflictException(
          'This email belongs to an account created with another sign-in method',
          'GOOGLE_EMAIL_ALREADY_REGISTERED',
        );
      }
      user = await this.usersService.createGoogle({
        email: payload.email,
        googleSubject: payload.sub,
        ...(payload.name ? { displayName: payload.name } : {}),
        ...(payload.given_name ? { firstName: payload.given_name } : {}),
        ...(payload.family_name ? { lastName: payload.family_name } : {}),
        ...(payload.picture ? { avatar: payload.picture } : {}),
      });
    } else if (!user) {
      const emailAccount = await this.usersService.findByEmail(payload.email);
      if (emailAccount) {
        throw new AuthenticationException(
          'This account was created with email and password',
          'USE_PASSWORD_SIGN_IN',
        );
      }
      throw new AuthenticationException(
        'No Google-created Verith account was found',
        'GOOGLE_ACCOUNT_NOT_FOUND',
      );
    }

    this.assertLoginAllowed(user);
    const result = await this.createSession(user, {
      ...context,
      ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
    });
    await this.usersService.recordLogin(user._id);
    return result;
  }

  async refresh(
    rawToken: string,
    context: SessionContext = {},
  ): Promise<AuthenticationResult> {
    const sessionId = rawToken.split('.', 1)[0];
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) {
      throw new AuthenticationException(
        'Invalid refresh token',
        'INVALID_REFRESH_TOKEN',
      );
    }
    const session = await this.sessionModel
      .findById(sessionId)
      .select('+refreshTokenHash')
      .exec();
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AuthenticationException(
        'Invalid refresh token',
        'INVALID_REFRESH_TOKEN',
      );
    }

    const presentedHash = this.tokenService.hash(rawToken);
    if (!this.constantTimeEqual(presentedHash, session.refreshTokenHash)) {
      if (
        this.sameSessionContext(session, context) &&
        Date.now() - session.lastUsedAt.getTime() <= CONCURRENT_REFRESH_GRACE_MS
      ) {
        throw new AuthenticationException(
          'The session was refreshed in another browser context; retry with the current cookie',
          'REFRESH_CONCURRENT_ROTATION',
        );
      }
      await this.revokeFamily(session.tokenFamilyId, 'REFRESH_TOKEN_REUSE');
      throw new AuthenticationException(
        'Refresh token reuse was detected',
        'REFRESH_TOKEN_REUSE_DETECTED',
      );
    }

    const user = await this.usersService.findByIdOrThrow(
      session.userId.toString(),
    );
    this.assertLoginAllowed(user);
    const nextRawToken = `${session.id}.${this.tokenService.createOpaqueToken()}`;
    const nextHash = this.tokenService.hash(nextRawToken);
    const rotated = await this.sessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          refreshTokenHash: session.refreshTokenHash,
          revokedAt: { $exists: false },
        },
        {
          $set: {
            refreshTokenHash: nextHash,
            lastUsedAt: new Date(),
            expiresAt: this.tokenService.refreshExpiry(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!rotated) {
      throw new AuthenticationException(
        'The session was refreshed concurrently; retry with the current cookie',
        'REFRESH_CONCURRENT_ROTATION',
      );
    }
    return this.buildAuthenticationResult(user, rotated, nextRawToken);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionModel
      .updateOne(
        { _id: sessionId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: 'USER_LOGOUT' } },
      )
      .exec();
  }

  async logoutAll(userId: string, reason = 'USER_LOGOUT_ALL'): Promise<void> {
    await this.sessionModel
      .updateMany(
        { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
      )
      .exec();
  }

  async listSessions(userId: string): Promise<Record<string, unknown>[]> {
    const sessions = await this.sessionModel
      .find({
        userId: new Types.ObjectId(userId),
        revokedAt: { $exists: false },
      })
      .sort({ lastUsedAt: -1 })
      .exec();
    return sessions.map((session) => {
      const parsed = parseUserAgent(session.userAgentSummary);
      return {
        id: session.id,
        deviceName: session.deviceName ?? parsed.deviceName,
        platform: session.platform ?? parsed.platform,
        browser: session.browser ?? parsed.browser,
        userAgentSummary: session.userAgentSummary,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
      };
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessionModel
      .updateOne(
        { _id: sessionId, userId: new Types.ObjectId(userId) },
        { $set: { revokedAt: new Date(), revokedReason: 'USER_REVOKED' } },
      )
      .exec();
  }

  async isSessionActive(userId: string, sessionId: string): Promise<boolean> {
    return Boolean(
      await this.sessionModel
        .exists({
          _id: sessionId,
          userId: new Types.ObjectId(userId),
          revokedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        })
        .exec(),
    );
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (
      !user ||
      user.status === UserStatus.DELETED ||
      (user.authProvider ?? AuthProvider.LOCAL) !== AuthProvider.LOCAL
    )
      return;
    const rawToken = await this.createAuthToken(
      user._id,
      AuthTokenPurpose.PASSWORD_RESET,
      this.authConfig.passwordResetTtlMinutes,
    );
    const actionUrl = `${this.appConfig.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.mailService.sendPasswordReset(
      user.email,
      actionUrl,
      this.authConfig.passwordResetTtlMinutes,
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const token = await this.consumeToken(
      dto.token,
      AuthTokenPurpose.PASSWORD_RESET,
    );
    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.authConfig.bcryptRounds,
    );
    await this.usersService.updatePassword(token.userId, passwordHash);
    await this.logoutAll(token.userId.toString(), 'PASSWORD_RESET');
    await this.publishSecurityAlert(
      token.userId.toString(),
      SecurityAlertKind.PASSWORD_RESET,
      `password-reset:${token._id.toString()}`,
    );
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdentifierWithPassword(
      (await this.usersService.findByIdOrThrow(userId)).email,
    );
    if (
      user &&
      (user.authProvider ?? AuthProvider.LOCAL) === AuthProvider.GOOGLE
    ) {
      throw new AuthenticationException(
        'Password changes are unavailable for Google accounts',
        'GOOGLE_ACCOUNT_HAS_NO_PASSWORD',
      );
    }
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new AuthenticationException(
        'The current password is incorrect',
        'CURRENT_PASSWORD_INVALID',
      );
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new ConflictException(
        'The new password must differ from the current password',
        'PASSWORD_UNCHANGED',
      );
    }
    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.authConfig.bcryptRounds,
    );
    await this.usersService.updatePassword(user._id, passwordHash);
    await this.logoutAll(userId, 'PASSWORD_CHANGED');
    await this.publishSecurityAlert(
      userId,
      SecurityAlertKind.PASSWORD_CHANGED,
      `password-change:${randomUUID()}`,
    );
  }

  private async createSession(
    user: UserDocument,
    context: SessionContext & { deviceName?: string },
  ): Promise<AuthenticationResult> {
    const sessionId = new Types.ObjectId();
    const rawToken = `${sessionId.toString()}.${this.tokenService.createOpaqueToken()}`;
    const parsedUserAgent = parseUserAgent(context.userAgentSummary);
    const deviceName = context.deviceName ?? parsedUserAgent.deviceName;
    const session = await this.sessionModel.create({
      _id: sessionId,
      userId: user._id,
      tokenFamilyId: this.tokenService.createFamilyId(),
      refreshTokenHash: this.tokenService.hash(rawToken),
      lastUsedAt: new Date(),
      expiresAt: this.tokenService.refreshExpiry(),
      ...context,
      ...(deviceName ? { deviceName } : {}),
      ...(parsedUserAgent.platform
        ? { platform: parsedUserAgent.platform }
        : {}),
      ...(parsedUserAgent.browser ? { browser: parsedUserAgent.browser } : {}),
      ...(context.ipHash
        ? { ipHash: this.tokenService.hash(context.ipHash) }
        : {}),
    });
    return this.buildAuthenticationResult(user, session, rawToken);
  }

  private async buildAuthenticationResult(
    user: UserDocument,
    session: SessionDocument,
    refreshToken: string,
  ): Promise<AuthenticationResult> {
    const accessToken = await this.tokenService.issueAccessToken({
      userId: user.id,
      sessionId: session.id,
      role: user.role,
      status: user.status,
    });
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.authConfig.accessExpiresIn,
      user: this.usersService.toPrivateProfile(user),
    };
  }

  private async issueEmailVerification(
    user: UserDocument,
  ): Promise<MailDeliveryResult> {
    await this.authTokenModel
      .deleteMany({
        userId: user._id,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
        consumedAt: { $exists: false },
      })
      .exec();
    const rawToken = await this.createAuthToken(
      user._id,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      this.authConfig.emailVerificationTtlMinutes,
    );
    const actionUrl = `${this.appConfig.frontendUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
    return this.mailService.sendEmailVerification(
      user.email,
      actionUrl,
      this.authConfig.emailVerificationTtlMinutes,
    );
  }

  private async createAuthToken(
    userId: Types.ObjectId,
    purpose: AuthTokenPurpose,
    ttlMinutes: number,
  ): Promise<string> {
    const rawToken = this.tokenService.createOpaqueToken();
    await this.authTokenModel.create({
      userId,
      purpose,
      tokenHash: this.tokenService.hash(rawToken),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    });
    return rawToken;
  }

  private async consumeToken(
    rawToken: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthTokenDocument> {
    const token = await this.authTokenModel
      .findOneAndUpdate(
        {
          tokenHash: this.tokenService.hash(rawToken),
          purpose,
          consumedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        { $set: { consumedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!token) {
      throw new AuthenticationException(
        'The token is invalid or expired',
        'AUTH_TOKEN_INVALID',
      );
    }
    return token;
  }

  private assertLoginAllowed(user: UserDocument): void {
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new AuthenticationException(
        'Email verification is required',
        'EMAIL_VERIFICATION_REQUIRED',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AuthenticationException(
        'This account is not available',
        'ACCOUNT_NOT_ACTIVE',
      );
    }
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.sessionModel
      .updateMany(
        { tokenFamilyId: familyId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
      )
      .exec();
  }

  private sameSessionContext(
    session: SessionDocument,
    context: SessionContext,
  ): boolean {
    const ipMatches =
      !session.ipHash || !context.ipHash || session.ipHash === context.ipHash;
    const userAgentMatches =
      !session.userAgentSummary ||
      !context.userAgentSummary ||
      session.userAgentSummary === context.userAgentSummary;
    return ipMatches && userAgentMatches;
  }

  private async publishSecurityAlert(
    userId: string,
    kind: SecurityAlertKind,
    operationId: string,
  ): Promise<void> {
    try {
      await this.domainEvents.publish({
        name: DomainEventName.SECURITY_ALERT_REQUESTED,
        aggregateType: 'USER',
        aggregateId: userId,
        correlationId: operationId,
        deduplicationKey: `security:${operationId}:v1`,
        payload: { userId, kind },
      });
    } catch {
      this.logger.warn({
        eventName: DomainEventName.SECURITY_ALERT_REQUESTED,
        aggregateId: userId,
        failureCode: 'DOMAIN_EVENT_OUTBOX_UNAVAILABLE',
      });
    }
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
