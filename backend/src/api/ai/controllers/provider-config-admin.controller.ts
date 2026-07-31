import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import { UpdateProviderConfigDto } from '../dto/provider-config.dto';
import { ProviderConfigService } from '../services/provider-config.service';

@ApiTags('AI Provider Admin')
@ApiBearerAuth()
@Controller('admin/ai/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ProviderConfigAdminController {
  constructor(private readonly config: ProviderConfigService) {}

  @Get()
  get() {
    return this.config.get();
  }

  @Patch()
  update(
    @Body() dto: UpdateProviderConfigDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.config.update(dto, actor, request.requestId);
  }
}
