import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthenticationException } from '../../../core/exceptions';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { MetaWhatsAppService } from '../services/meta-whatsapp.service';
import { WhatsAppLinkService } from '../services/whatsapp-link.service';
import { WhatsAppService } from '../services/whatsapp.service';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly meta: MetaWhatsAppService,
    private readonly links: WhatsAppLinkService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Get('webhook')
  @ApiExcludeEndpoint()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ) {
    if (!challenge || !this.meta.verifyWebhookToken(mode, token))
      throw new AuthenticationException(
        'WhatsApp webhook verification failed',
        'WHATSAPP_WEBHOOK_VERIFICATION_FAILED',
      );
    response.type('text/plain').send(challenge);
  }

  @Post('webhook')
  @ApiExcludeEndpoint()
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    if (
      !request.rawBody ||
      !this.meta.verifySignature(request.rawBody, signature)
    )
      throw new AuthenticationException(
        'WhatsApp webhook signature is invalid',
        'WHATSAPP_WEBHOOK_SIGNATURE_INVALID',
      );
    return this.whatsapp.acceptWebhook(request.body);
  }

  @Post('link-code')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  linkCode(@CurrentUser() user: AuthUser) {
    return this.links.createCode(user.userId);
  }

  @Get('link-status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.links.status(user.userId);
  }

  @Delete('link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@CurrentUser() user: AuthUser): Promise<void> {
    return this.links.unlink(user.userId);
  }
}
