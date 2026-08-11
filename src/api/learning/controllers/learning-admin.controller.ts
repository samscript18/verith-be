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
  CreateCourseDto,
  CreateLessonDto,
  LearningAdminQueryDto,
  UpdateCourseDto,
  UpdateCourseStatusDto,
  UpdateLessonDto,
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

  @Get('courses')
  listCourses(@Query() query: LearningAdminQueryDto) {
    return this.learning.listCoursesAdmin(query);
  }

  @Get('courses/:id')
  getCourse(@Param('id', ParseObjectIdPipe) id: string) {
    return this.learning.getCourseAdmin(id);
  }

  @Get('lessons')
  listLessons(@Query() query: LearningAdminQueryDto) {
    return this.learning.listLessonsAdmin(query);
  }

  @Get('lessons/:id')
  getLesson(@Param('id', ParseObjectIdPipe) id: string) {
    return this.learning.getLessonAdmin(id);
  }

  @Post('courses')
  createCourse(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    return this.learning.createCourse(user.userId, dto);
  }

  @Post('lessons')
  createLesson(@CurrentUser() user: AuthUser, @Body() dto: CreateLessonDto) {
    return this.learning.createLesson(user.userId, dto);
  }

  @Patch('courses/:id')
  updateCourse(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.learning.updateCourse(user.userId, id, dto);
  }

  @Patch('lessons/:id')
  updateLesson(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.learning.updateLesson(user.userId, id, dto);
  }

  @Delete('courses/:id')
  archiveCourse(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Req() request: RequestWithId,
  ) {
    return this.learning.archiveCourse(
      actor,
      id,
      dto.reason,
      request.requestId,
    );
  }

  @Delete('lessons/:id')
  archiveLesson(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Req() request: RequestWithId,
  ) {
    return this.learning.archiveLesson(
      actor,
      id,
      dto.reason,
      request.requestId,
    );
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
