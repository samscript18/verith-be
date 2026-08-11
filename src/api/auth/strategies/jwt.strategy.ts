import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthConfig } from '../../../shared/config';
import { AuthenticationException } from '../../../core/exceptions';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import type { AuthUser } from '../interfaces/auth-user.interface';
import { AuthService } from '../services/auth.service';

interface JwtPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {
    const config = configService.getOrThrow<AuthConfig>('auth');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.accessSecret,
      issuer: 'verith',
      audience: 'verith-api',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usersService.findByIdOrThrow(payload.sub);
    if (!(await this.authService.isSessionActive(payload.sub, payload.sid))) {
      throw new AuthenticationException(
        'The session is no longer active',
        'SESSION_REVOKED',
      );
    }
    if (
      user.status !== UserStatus.ACTIVE &&
      user.status !== UserStatus.DELETION_PENDING
    ) {
      throw new AuthenticationException(
        'This account cannot access protected resources',
        'ACCOUNT_NOT_ACTIVE',
      );
    }
    return {
      userId: user.id,
      sessionId: payload.sid,
      role: user.role,
      status: user.status,
    };
  }
}
