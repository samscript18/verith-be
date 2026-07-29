import {
  DomainEventName,
  SecurityAlertKind,
  type DomainEventEnvelope,
} from '../../../core/events/domain-event.contracts';
import { NotificationType } from '../enums/notification.enum';
import { NotificationsService } from '../services/notifications.service';
import { DomainNotificationHandler } from './domain-notification.handler';

describe('DomainNotificationHandler', () => {
  it('maps a completed verification event to an idempotent notification', async () => {
    const dispatch = jest.fn().mockResolvedValue({});
    const handler = new DomainNotificationHandler({
      dispatch,
    } as unknown as NotificationsService);
    const event = envelope(DomainEventName.VERIFICATION_COMPLETED, {
      userId: 'user-1',
      verificationId: 'verification-1',
      reportId: 'report-1',
    });

    await handler.handleVerificationCompleted(event);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: NotificationType.VERIFICATION_COMPLETED,
        idempotencyReference: 'event:event-1:notification',
      }),
    );
  });

  it('maps security facts to security-alert copy at the consumer', async () => {
    const dispatch = jest.fn().mockResolvedValue({});
    const handler = new DomainNotificationHandler({
      dispatch,
    } as unknown as NotificationsService);

    await handler.handleSecurityAlert(
      envelope(DomainEventName.SECURITY_ALERT_REQUESTED, {
        userId: 'user-1',
        kind: SecurityAlertKind.PASSWORD_RESET,
      }),
    );

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.SECURITY_ALERT,
        title: 'Password reset completed',
      }),
    );
  });
});

function envelope<TName extends DomainEventName>(
  name: TName,
  payload: DomainEventEnvelope<TName>['payload'],
): DomainEventEnvelope<TName> {
  return {
    id: 'event-1',
    name,
    version: 1,
    aggregateType: 'TEST',
    aggregateId: 'aggregate-1',
    correlationId: 'request-1',
    occurredAt: new Date('2026-07-29T12:00:00.000Z'),
    payload,
  };
}
