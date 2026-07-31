import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  AdminReasonDto,
  AdminUserQueryDto,
  AdminUserRoleDto,
  AdminUserStatusDto,
  AdminVerificationQueryDto,
  AuditQueryDto,
} from '../dto/admin.dto';
import { AdminService } from '../services/admin.service';
import { AuditService } from '../services/audit.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'Search users without exposing credentials' })
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get safe administrative user details' })
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Change account status and revoke sessions when required',
  })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: AdminUserStatusDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.admin.changeStatus(id, dto.status, {
      actor,
      requestId: request.requestId,
      reason: dto.reason,
    });
  }

  @Patch('users/:id/role')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Change a user role as a super administrator' })
  changeRole(
    @Param('id') id: string,
    @Body() dto: AdminUserRoleDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.admin.changeRole(id, dto.role, {
      actor,
      requestId: request.requestId,
      reason: dto.reason,
    });
  }

  @Get('verifications')
  @ApiOperation({ summary: 'Inspect verification lifecycle metadata' })
  listVerifications(@Query() query: AdminVerificationQueryDto) {
    return this.admin.listVerifications(query);
  }

  @Get('verifications/:id')
  @ApiOperation({
    summary: 'Inspect safe verification lifecycle metadata without input',
  })
  getVerification(@Param('id', ParseObjectIdPipe) id: string) {
    return this.admin.getVerification(id);
  }

  @Post('verifications/:id/retry')
  @Throttle({ default: { limit: 5, ttl: 60 * 1000 } })
  @ApiOperation({ summary: 'Idempotently enqueue a failed verification retry' })
  retryVerification(
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.admin.retryVerification(id, {
      actor,
      requestId: request.requestId,
      reason: dto.reason,
    });
  }

  @Get('audit-logs')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List append-only administrative audit records' })
  listAuditLogs(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
