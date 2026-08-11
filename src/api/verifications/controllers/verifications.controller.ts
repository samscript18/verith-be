import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  CreateVerificationDto,
  normalizeIdempotencyKey,
  UpdateVerificationVisibilityDto,
  VerificationEventsQueryDto,
  VerificationQueryDto,
} from '../dto/verification.dto';
import { VerificationEventService } from '../services/verification-event.service';
import { VerificationService } from '../services/verification.service';
import { ClaimExtractionService } from '../services/claim-extraction.service';
import { EvidenceSearchService } from '../services/evidence-search.service';
import { VerificationAnalysisService } from '../../analysis/services/verification-analysis.service';
import { MediaProcessingService } from '../../media/services/media-processing.service';
import { GuidedInvestigationService } from '../services/guided-investigation.service';
import { SubmitGuidedResponsesDto } from '../dto/guided-investigation.dto';

@ApiTags('Verifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verifications')
export class VerificationsController {
  constructor(
    private readonly verifications: VerificationService,
    private readonly events: VerificationEventService,
    private readonly claims: ClaimExtractionService,
    private readonly evidence: EvidenceSearchService,
    private readonly analysis: VerificationAnalysisService,
    private readonly media: MediaProcessingService,
    private readonly guidance: GuidedInvestigationService,
  ) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Create and enqueue a verification' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVerificationDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.verifications.create(
      user.userId,
      dto,
      normalizeIdempotencyKey(key),
      request.requestId,
    );
  }

  @Get(':id/media')
  @ApiOperation({ summary: 'Retrieve image analysis or audio transcript' })
  async getMedia(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    await this.verifications.findOwned(user.userId, id);
    return this.media.get(id);
  }

  @Get(':id/analysis')
  @ApiOperation({
    summary: 'Retrieve evidence-derived analysis and confidence factors',
  })
  async getAnalysis(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    await this.verifications.findOwned(user.userId, id);
    return this.analysis.get(id);
  }

  @Get(':id/evidence')
  @ApiOperation({ summary: 'List retrieved evidence and source access states' })
  async listEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    await this.verifications.findOwned(user.userId, id);
    return this.evidence.list(id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: VerificationQueryDto) {
    return this.verifications.list(user.userId, query);
  }

  @Get('allowance')
  @ApiOperation({ summary: 'Get today’s investigation allowance' })
  allowance(@CurrentUser() user: AuthUser) {
    return this.verifications.allowance(user.userId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.verifications.get(user.userId, id);
  }

  @Get(':id/events')
  async listEvents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: VerificationEventsQueryDto,
  ) {
    await this.verifications.findOwned(user.userId, id);
    const events = await this.events.list(id, query.after);
    return events.map((event) => this.events.toResponse(event));
  }

  @Get(':id/claims')
  @ApiOperation({ summary: 'List extracted claims and search queries' })
  async listClaims(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    await this.verifications.findOwned(user.userId, id);
    return this.claims.list(id);
  }

  @Get(':id/guidance')
  @ApiOperation({ summary: 'Get the guided-investigation exercise' })
  async guidanceFor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    const verification = await this.verifications.findOwned(user.userId, id);
    return this.guidance.get(verification);
  }

  @Post(':id/guidance/responses')
  @ApiOperation({ summary: 'Submit guided-investigation reasoning' })
  async submitGuidance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SubmitGuidedResponsesDto,
  ) {
    const verification = await this.verifications.findOwned(user.userId, id);
    return this.guidance.submit(verification, dto);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.verifications.cancel(user.userId, id, request.requestId);
  }

  @Post(':id/retry')
  retry(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.verifications.retry(user.userId, id, request.requestId);
  }

  @Post(':id/reprocess')
  @ApiOperation({
    summary:
      'Create a new report version by rerunning a completed verification',
  })
  reprocess(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.verifications.reprocess(user.userId, id, request.requestId);
  }

  @Patch(':id/visibility')
  visibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateVerificationVisibilityDto,
  ) {
    return this.verifications.updateVisibility(user.userId, id, dto.visibility);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.verifications.remove(user.userId, id);
  }
}
