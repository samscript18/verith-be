import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('Admin analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get real operational aggregates for the last 30 days',
  })
  overview() {
    return this.analytics.overview();
  }

  @Get('pilots')
  @ApiOperation({
    summary: 'Get privacy-thresholded mission and pilot aggregates',
  })
  pilots() {
    return this.analytics.pilots();
  }
}
