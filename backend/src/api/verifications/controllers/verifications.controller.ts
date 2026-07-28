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

@ApiTags('Verifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verifications')
export class VerificationsController {
  constructor(
    private readonly verifications: VerificationService,
    private readonly events: VerificationEventService,
    private readonly claims: ClaimExtractionService,
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

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: VerificationQueryDto) {
    return this.verifications.list(user.userId, query);
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
