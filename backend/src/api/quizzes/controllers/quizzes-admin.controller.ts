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
import { CreateQuizDto, UpdateQuizStatusDto } from '../dto/quiz.dto';
import { QuizzesService } from '../services/quizzes.service';

@ApiTags('Quizzes Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CONTENT_EDITOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/quizzes')
export class QuizzesAdminController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuizDto) {
    return this.quizzes.create(user.userId, dto);
  }

  @Patch(':id/status')
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateQuizStatusDto,
  ) {
    return this.quizzes.setStatus(user.userId, id, dto.status);
  }
}
