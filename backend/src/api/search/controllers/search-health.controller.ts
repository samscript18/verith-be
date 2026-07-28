import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { SearchHealthService } from '../services/search-health.service';

class SearchHealthQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  force = false;
}

@ApiTags('Search Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('integrations/search')
export class SearchHealthController {
  constructor(private readonly health: SearchHealthService) {}

  @Get('health')
  @ApiOperation({
    summary:
      'Check search connectivity (a forced Tavily check consumes a search credit)',
  })
  check(@Query() query: SearchHealthQueryDto) {
    return this.health.all(query.force);
  }
}
