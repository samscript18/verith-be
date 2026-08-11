import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../../api/auth/interfaces/auth-user.interface';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import type { UserRole } from '../../api/users/enums/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;
    return Boolean(user && required.includes(user.role));
  }
}
