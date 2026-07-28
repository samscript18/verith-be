import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { StringValue } from 'ms';
import type { AuthConfig } from '../../../shared/config';
import type { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class TokenService {
  private readonly config: AuthConfig;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AuthConfig>('auth');
  }

  issueAccessToken(user: AuthUser): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.userId,
        sid: user.sessionId,
        role: user.role,
        status: user.status,
      },
      {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessExpiresIn as StringValue,
        issuer: 'verith',
        audience: 'verith-api',
      },
    );
  }

  createOpaqueToken(): string {
    return randomBytes(48).toString('base64url');
  }

  createFamilyId(): string {
    return randomUUID();
  }

  hash(token: string): string {
    return createHmac('sha256', this.config.hashingPepper)
      .update(token)
      .digest('hex');
  }

  secureEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  refreshExpiry(): Date {
    return new Date(
      Date.now() + this.config.refreshExpiresDays * 24 * 60 * 60 * 1000,
    );
  }
}
