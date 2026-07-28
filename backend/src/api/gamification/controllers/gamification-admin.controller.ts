import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import { CreateBadgeDto } from '../dto/gamification.dto';
import { GamificationService } from '../services/gamification.service';

@ApiTags('Gamification Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/gamification')
export class GamificationAdminController {
  constructor(private readonly gamification: GamificationService) {}

  @Post('badges')
  createBadge(@CurrentUser() user: AuthUser, @Body() dto: CreateBadgeDto) {
    return this.gamification.createBadge(user.userId, dto);
  }
}
