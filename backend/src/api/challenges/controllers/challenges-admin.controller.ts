import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import {
  CreateChallengeDto,
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
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChallengeDto) {
    return this.challenges.create(user.userId, dto);
  }
  @Patch(':id/status')
  status(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateChallengeStatusDto,
  ) {
    return this.challenges.setStatus(id, dto.status);
  }
}
