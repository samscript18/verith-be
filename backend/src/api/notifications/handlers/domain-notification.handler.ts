import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEventName,
  SecurityAlertKind,
  type DomainEventEnvelope,
} from '../../../core/events/domain-event.contracts';
import { NotificationType } from '../enums/notification.enum';
import { NotificationsService } from '../services/notifications.service';

@Injectable()
export class DomainNotificationHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DomainEventName.VERIFICATION_COMPLETED)
  handleVerificationCompleted(
    event: DomainEventEnvelope<DomainEventName.VERIFICATION_COMPLETED>,
  ) {
    return this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.VERIFICATION_COMPLETED,
      title: 'Verification complete',
      message: 'Your Verith verification report is ready to review.',
      idempotencyReference: `event:${event.id}:notification`,
      metadata: {
        verificationId: event.payload.verificationId,
        reportId: event.payload.reportId,
      },
    });
  }

  @OnEvent(DomainEventName.VERIFICATION_FAILED)
  handleVerificationFailed(
    event: DomainEventEnvelope<DomainEventName.VERIFICATION_FAILED>,
  ) {
    return this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.VERIFICATION_FAILED,
      title: 'Verification could not be completed',
      message:
        'Your verification could not be completed. You can review its status in Verith.',
      idempotencyReference: `event:${event.id}:notification`,
      metadata: {
        verificationId: event.payload.verificationId,
        failureCode: event.payload.failureCode,
      },
    });
  }

  @OnEvent(DomainEventName.SECURITY_ALERT_REQUESTED)
  handleSecurityAlert(
    event: DomainEventEnvelope<DomainEventName.SECURITY_ALERT_REQUESTED>,
  ) {
    const content =
      event.payload.kind === SecurityAlertKind.PASSWORD_RESET
        ? {
            title: 'Password reset completed',
            message:
              'Your Verith password was reset and existing sessions were revoked.',
          }
        : {
            title: 'Password changed',
            message:
              'Your Verith password changed and existing sessions were revoked.',
          };
    return this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.SECURITY_ALERT,
      ...content,
      idempotencyReference: `event:${event.id}:notification`,
    });
  }
}
