import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../../../shared/decorators/skip-response-envelope.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  ReportFeedbackDto,
  UpdateReportVisibilityDto,
} from '../dto/report.dto';
import { ReportExportFormat } from '../enums/report.enum';
import { ReportService } from '../services/report.service';
import { MilCoachService } from '../services/mil-coach.service';
import { CheckCardService } from '../services/check-card.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportService,
    private readonly coach: MilCoachService,
    private readonly checkCards: CheckCardService,
  ) {}

  @Get('verification/:verificationId/latest')
  latest(
    @CurrentUser() user: AuthUser,
    @Param('verificationId', ParseObjectIdPipe) verificationId: string,
  ) {
    return this.reports.latestOwned(user.userId, verificationId);
  }

  @Get(':id/check-card')
  @ApiOperation({ summary: 'Get a public-safe check card from report data' })
  checkCard(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.checkCards.forOwner(user.userId, id);
  }

  @Get(':id/check-card.svg')
  @SkipResponseEnvelope()
  @ApiOperation({ summary: 'Download a public-safe Verith Check Card' })
  async checkCardSvg(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const card = await this.checkCards.forOwner(user.userId, id);
    const bytes = this.checkCards.renderSvg(card);
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="verith-check-card-v${card.reportVersion}.svg"`,
    );
    response.setHeader('Content-Length', String(bytes.length));
    return new StreamableFile(bytes);
  }

  @Get('verification/:verificationId/versions')
  versions(
    @CurrentUser() user: AuthUser,
    @Param('verificationId', ParseObjectIdPipe) verificationId: string,
  ) {
    return this.reports.versionsOwned(user.userId, verificationId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.reports.getOwned(user.userId, id);
  }

  @Get(':id/coach')
  @ApiOperation({ summary: 'Get deterministic media-literacy coaching' })
  coachFor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.coach.forReport(user.userId, id);
  }

  @Post(':id/evidence/:evidenceId/inspect')
  @ApiOperation({
    summary: 'Record that the report owner opened an evidence source',
  })
  inspectEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.reports.inspectEvidence(user.userId, id, evidenceId);
  }

  @Patch(':id/visibility')
  visibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateReportVisibilityDto,
  ) {
    return this.reports.setVisibility(user.userId, id, dto.visibility);
  }

  @Post(':id/revoke')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.reports.revoke(user.userId, id);
  }

  @Post(':id/feedback')
  feedback(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReportFeedbackDto,
  ) {
    return this.reports.feedback(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.reports.remove(user.userId, id);
  }

  @Get(':id/export/json')
  @SkipResponseEnvelope()
  @ApiOperation({ summary: 'Download a real public-safe JSON report export' })
  async jsonExport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.download(user.userId, id, ReportExportFormat.JSON, response);
  }

  @Get(':id/export/pdf')
  @SkipResponseEnvelope()
  @ApiOperation({ summary: 'Download a real public-safe PDF report export' })
  async pdfExport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.download(user.userId, id, ReportExportFormat.PDF, response);
  }

  private async download(
    userId: string,
    reportId: string,
    format: ReportExportFormat,
    response: Response,
  ) {
    const result = await this.reports.export(userId, reportId, format);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader('Content-Length', String(result.bytes.length));
    return new StreamableFile(result.bytes);
  }
}
