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
    const handler = new DomainNotificationHandler(
      {
        dispatch,
      } as unknown as NotificationsService,
      emptyReportModel(),
      {} as never,
    );
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
    const handler = new DomainNotificationHandler(
      {
        dispatch,
      } as unknown as NotificationsService,
      {} as never,
      {} as never,
    );

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

  it('notifies a user only when a real published course matches the completed report', async () => {
    const dispatch = jest.fn().mockResolvedValue({});
    const courseId = '507f1f77bcf86cd799439011';
    const handler = new DomainNotificationHandler(
      { dispatch } as unknown as NotificationsService,
      modelResult({ learningRecommendations: [{ tag: 'source_quality' }] }),
      modelResult({
        _id: { toString: () => courseId },
        title: 'Read the Source, Not the Headline',
        slug: 'read-the-source',
        difficulty: 'BEGINNER',
      }),
    );

    await handler.handleVerificationCompleted(
      envelope(DomainEventName.VERIFICATION_COMPLETED, {
        userId: 'user-1',
        verificationId: 'verification-1',
        reportId: 'report-1',
      }),
    );

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: NotificationType.LESSON_RECOMMENDATION,
        actionUrl: '/app/learning/read-the-source',
        idempotencyReference: 'event:event-1:learning-recommendation',
      }),
    );
  });
});

function emptyReportModel() {
  return {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    }),
  } as never;
}

function modelResult(value: unknown) {
  const exec = jest.fn().mockResolvedValue(value);
  const lean = jest.fn().mockReturnValue({ exec });
  const sort = jest.fn().mockReturnValue({ lean });
  return {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean }),
    }),
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ sort }),
    }),
  } as never;
}

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
