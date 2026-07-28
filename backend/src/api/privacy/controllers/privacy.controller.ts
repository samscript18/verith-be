import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../../../shared/decorators/skip-response-envelope.decorator';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { PrivacyService } from '../services/privacy.service';

@ApiTags('Privacy')
@ApiBearerAuth()
@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('exports')
  @Throttle({ default: { limit: 2, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Request an encrypted asynchronous account export' })
  requestExport(@CurrentUser() user: AuthUser, @Req() request: RequestWithId) {
    return this.privacy.requestExport(user.userId, request.requestId);
  }

  @Get('exports/:id')
  @ApiOperation({ summary: 'Get account export preparation status' })
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.privacy.status(user.userId, id);
  }

  @Get('exports/:id/download')
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @SkipResponseEnvelope()
  @ApiOperation({ summary: 'Download a completed account export' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Headers('x-data-export-token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bytes = await this.privacy.download(user.userId, id, token);
    response.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="verith-data-${id}.json"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(bytes);
  }
}
