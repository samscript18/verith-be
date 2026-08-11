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
  ReportFeedbackAdminQueryDto,
  ResolveReportFeedbackDto,
} from '../dto/report-feedback-admin.dto';
import { ReportService } from '../services/report.service';

@ApiTags('Report Feedback Admin')
@ApiBearerAuth()
@Controller('admin/feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ReportFeedbackAdminController {
  constructor(private readonly reports: ReportService) {}

  @Get()
  list(@Query() query: ReportFeedbackAdminQueryDto) {
    return this.reports.listFeedback(query);
  }

  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reports.getFeedback(id);
  }

  @Patch(':id')
  resolve(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ResolveReportFeedbackDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: RequestWithId,
  ) {
    return this.reports.resolveFeedback(id, dto, actor, request.requestId);
  }
}
