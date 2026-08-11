import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  PublisherAdminQueryDto,
  PublisherOverrideDto,
} from '../dto/publisher-admin.dto';
import { PublishersService } from '../services/publishers.service';

@ApiTags('Publishers Admin')
@ApiBearerAuth()
@Controller('admin/publishers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class PublishersAdminController {
  constructor(private readonly publishers: PublishersService) {}

  @Get()
  list(@Query() query: PublisherAdminQueryDto) {
    return this.publishers.listAdmin(query);
  }

  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.publishers.getAdmin(id);
  }

  @Patch(':id/override')
  override(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: PublisherOverrideDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.publishers.override(id, dto, actor, request.requestId);
  }
}
