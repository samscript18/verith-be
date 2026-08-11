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
  CreatePromptVersionDto,
  PromptActionDto,
  PromptAdminQueryDto,
} from '../dto/prompt-admin.dto';
import { PromptRegistryService } from '../services/prompt-registry.service';

@ApiTags('AI Prompt Admin')
@ApiBearerAuth()
@Controller('admin/ai/prompts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PromptAdminController {
  constructor(private readonly prompts: PromptRegistryService) {}

  @Get()
  list(@Query() query: PromptAdminQueryDto) {
    return this.prompts.listAdmin(query);
  }

  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.prompts.getAdmin(id);
  }

  @Post()
  create(
    @Body() dto: CreatePromptVersionDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.prompts.createVersion(dto, actor, request.requestId);
  }

  @Patch(':id/publish')
  publish(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: PromptActionDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.prompts.publish(id, dto.reason, actor, request.requestId);
  }

  @Patch(':id/rollback')
  rollback(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: PromptActionDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.prompts.publish(id, dto.reason, actor, request.requestId, true);
  }
}
