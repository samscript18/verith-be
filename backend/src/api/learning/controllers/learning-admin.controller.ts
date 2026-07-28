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
  CreateCourseDto,
  CreateLessonDto,
  UpdateCourseStatusDto,
  UpdateLessonStatusDto,
} from '../dto/learning.dto';
import { LearningService } from '../services/learning.service';

@ApiTags('Learning Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CONTENT_EDITOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/learning')
export class LearningAdminController {
  constructor(private readonly learning: LearningService) {}

  @Post('courses')
  createCourse(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    return this.learning.createCourse(user.userId, dto);
  }

  @Post('lessons')
  createLesson(@CurrentUser() user: AuthUser, @Body() dto: CreateLessonDto) {
    return this.learning.createLesson(user.userId, dto);
  }

  @Patch('courses/:id/status')
  courseStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCourseStatusDto,
  ) {
    return this.learning.setCourseStatus(user.userId, id, dto.status);
  }

  @Patch('lessons/:id/status')
  lessonStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLessonStatusDto,
  ) {
    return this.learning.setLessonStatus(user.userId, id, dto.status);
  }
}
