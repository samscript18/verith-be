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
  CreateQuizDto,
  QuizAdminQueryDto,
  UpdateQuizDto,
  UpdateQuizStatusDto,
} from '../dto/quiz.dto';
import { QuizzesService } from '../services/quizzes.service';

@ApiTags('Quizzes Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CONTENT_EDITOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/quizzes')
export class QuizzesAdminController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  list(@Query() query: QuizAdminQueryDto) {
    return this.quizzes.listAdmin(query);
  }

  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.quizzes.getAdmin(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuizDto) {
    return this.quizzes.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizzes.update(user.userId, id, dto);
  }

  @Delete(':id')
  archive(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Req() request: RequestWithId,
  ) {
    return this.quizzes.archive(actor, id, dto.reason, request.requestId);
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
