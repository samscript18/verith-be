import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { AdminReasonDto } from '../../admin/dto/admin.dto';
import { UserRole } from '../../users/enums/user-role.enum';
import { CreateBadgeDto, UpdateBadgeDto } from '../dto/gamification.dto';
import { GamificationService } from '../services/gamification.service';

@ApiTags('Gamification Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/gamification')
export class GamificationAdminController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('badges')
  listBadges() {
    return this.gamification.listBadgesAdmin();
  }

  @Get('badges/:id')
  getBadge(@Param('id', ParseObjectIdPipe) id: string) {
    return this.gamification.getBadgeAdmin(id);
  }

  @Post('badges')
  createBadge(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateBadgeDto,
    @Req() request: RequestWithId,
  ) {
    return this.gamification.createBadge(actor, dto, request.requestId);
  }

  @Patch('badges/:id')
  updateBadge(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateBadgeDto,
    @Req() request: RequestWithId,
  ) {
    return this.gamification.updateBadge(id, actor, dto, request.requestId);
  }

  @Delete('badges/:id')
  archiveBadge(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminReasonDto,
    @Req() request: RequestWithId,
  ) {
    return this.gamification.archiveBadge(
      id,
      actor,
      dto.reason,
      request.requestId,
    );
  }
}
