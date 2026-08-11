import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { SubmitQuizDto } from '../dto/quiz.dto';
import { QuizzesService } from '../services/quizzes.service';

@ApiTags('Quizzes')
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.quizzes.getPublished(id);
  }

  @Get('lesson/:lessonId')
  byLesson(@Param('lessonId', ParseObjectIdPipe) lessonId: string) {
    return this.quizzes.getPublishedByLesson(lessonId);
  }

  @Get(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  attempts(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.quizzes.myAttempts(user.userId, id);
  }

  @Post(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizzes.submit(user.userId, id, dto);
  }
}
