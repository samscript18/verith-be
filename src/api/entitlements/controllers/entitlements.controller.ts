import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import { GrantEntitlementDto } from '../dto/entitlement.dto';
import { EntitlementService } from '../services/entitlement.service';

@ApiTags('Entitlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementService) {}

  @Get('entitlements/me')
  @ApiOperation({ summary: 'Get the current effective product entitlement' })
  mine(@CurrentUser() user: AuthUser) {
    return this.entitlements.resolve(user.userId);
  }

  @Put('admin/entitlements/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Grant a sponsored or administrative entitlement' })
  grant(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @Body() dto: GrantEntitlementDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.entitlements.grant(userId, dto, actor, request.requestId);
  }
}
