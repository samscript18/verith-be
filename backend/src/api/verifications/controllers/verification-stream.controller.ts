import {
  Controller,
  MessageEvent,
  Param,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { from, fromEvent, interval, map, merge, Observable } from 'rxjs';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../../../shared/decorators/skip-response-envelope.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { VerificationEventsQueryDto } from '../dto/verification.dto';
import { VerificationEventService } from '../services/verification-event.service';
import { VerificationService } from '../services/verification.service';

@ApiTags('Verifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verifications')
export class VerificationStreamController {
  constructor(
    private readonly verifications: VerificationService,
    private readonly events: VerificationEventService,
    private readonly emitter: EventEmitter2,
  ) {}

  @Sse(':id/stream')
  @SkipResponseEnvelope()
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Stream persisted and live verification events' })
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: VerificationEventsQueryDto,
  ): Promise<Observable<MessageEvent>> {
    await this.verifications.findOwned(user.userId, id);
    const existing = await this.events.list(id, query.after);
    const history$ = from(existing).pipe(
      map((event) => ({
        id: String(event.sequence),
        type: 'verification.event',
        data: this.events.toResponse(event),
      })),
    );
    const live$ = fromEvent<Record<string, unknown>>(
      this.emitter,
      this.events.channel(id),
    ).pipe(
      map((data) => ({
        id:
          typeof data.sequence === 'number' || typeof data.sequence === 'string'
            ? String(data.sequence)
            : '',
        type: 'verification.event',
        data,
      })),
    );
    const heartbeat$ = interval(15000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      })),
    );
    return merge(history$, live$, heartbeat$);
  }
}
