import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { AdminReasonDto } from '../../admin/dto/admin.dto';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  CreateChallengeDto,
  ChallengeAdminQueryDto,
  UpdateChallengeDto,
  UpdateChallengeStatusDto,
} from '../dto/challenge.dto';
import { ChallengesService } from '../services/challenges.service';

@ApiTags('Challenges Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CONTENT_EDITOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/challenges')
export class ChallengesAdminController {
  constructor(private readonly challenges: ChallengesService) {}
  @Get()
  list(@Query() query: ChallengeAdminQueryDto) {
    return this.challenges.listAdmin(query);
  }
  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.challenges.getAdmin(id);
  }
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChallengeDto) {
    return this.challenges.create(user.userId, dto);
  }
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateChallengeDto,
  ) {
    return this.challenges.update(user.userId, id, dto);
  }
  @Delete(':id')
  archive(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Req() request: RequestWithId,
  ) {
    return this.challenges.archive(actor, id, dto.reason, request.requestId);
  }
  @Patch(':id/status')
  status(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateChallengeStatusDto,
  ) {
    return this.challenges.setStatus(id, dto.status);
  }
}
