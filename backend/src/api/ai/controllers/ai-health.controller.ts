import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProviderHealthService } from '../services/provider-health.service';

class ProviderHealthQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  force = false;
}

@ApiTags('AI Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('integrations/ai')
export class AiHealthController {
  constructor(private readonly health: ProviderHealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check configured AI provider connectivity' })
  check(@Query() query: ProviderHealthQueryDto) {
    return this.health.all(query.force);
  }
}
