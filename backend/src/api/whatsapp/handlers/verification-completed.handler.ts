import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEventName,
  type DomainEventEnvelope,
} from '../../../core/events/domain-event.contracts';
import { WhatsAppService } from '../services/whatsapp.service';

@Injectable()
export class VerificationCompletedWhatsAppHandler {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @OnEvent(DomainEventName.VERIFICATION_COMPLETED)
  handle(event: DomainEventEnvelope<DomainEventName.VERIFICATION_COMPLETED>) {
    return this.whatsapp.sendCompletion(
      event.payload.userId,
      event.payload.verificationId,
      event.payload.reportId,
    );
  }
}
