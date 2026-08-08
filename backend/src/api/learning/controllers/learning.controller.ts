import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  PublishedCourseQueryDto,
  UpdateLessonProgressDto,
} from '../dto/learning.dto';
import { LearningService } from '../services/learning.service';

@ApiTags('Learning')
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('courses')
  listCourses(@Query() query: PublishedCourseQueryDto) {
    return this.learning.listPublished(query);
  }

  @Get('courses/:slug')
  getCourse(@Param('slug') slug: string) {
    return this.learning.getPublished(slug);
  }

  @Get('lessons/:slug')
  getLesson(@Param('slug') slug: string) {
    return this.learning.getPublishedLesson(slug);
  }

  @Patch('lessons/:id/progress')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  progress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLessonProgressDto,
  ) {
    return this.learning.updateProgress(user.userId, id, dto);
  }

  @Get('courses/:id/progress')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myProgress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.learning.myProgress(user.userId, id);
  }

  @Get('recommendations/report/:reportId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  recommendations(
    @CurrentUser() user: AuthUser,
    @Param('reportId', ParseObjectIdPipe) reportId: string,
  ) {
    return this.learning.recommendations(user.userId, reportId);
  }
}
