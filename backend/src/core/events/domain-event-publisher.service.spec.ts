import type { Model } from 'mongoose';
import { DomainEventName, SecurityAlertKind } from './domain-event.contracts';
import { DomainEventPublisher } from './domain-event-publisher.service';
import type { DomainEventOutboxRecord } from './domain-event.schema';
import { DomainEventStatus } from './domain-event-status.enum';

describe('DomainEventPublisher', () => {
  it('persists a typed, deduplicated pending event without sensitive content', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        eventId: 'event-1',
        name: DomainEventName.SECURITY_ALERT_REQUESTED,
        aggregateType: 'USER',
        aggregateId: 'user-1',
        correlationId: 'operation-1',
        occurredAt: new Date('2026-07-29T12:00:00.000Z'),
        payload: {
          userId: 'user-1',
          kind: SecurityAlertKind.PASSWORD_CHANGED,
        },
      }),
    });
    const publisher = new DomainEventPublisher({
      findOneAndUpdate,
    } as unknown as Model<DomainEventOutboxRecord>);

    const result = await publisher.publish({
      name: DomainEventName.SECURITY_ALERT_REQUESTED,
      aggregateType: 'USER',
      aggregateId: 'user-1',
      correlationId: 'operation-1',
      deduplicationKey: 'security:operation-1:v1',
      payload: {
        userId: 'user-1',
        kind: SecurityAlertKind.PASSWORD_CHANGED,
      },
    });

    expect(result).toMatchObject({
      id: 'event-1',
      name: DomainEventName.SECURITY_ALERT_REQUESTED,
      payload: { kind: SecurityAlertKind.PASSWORD_CHANGED },
    });
    const persistenceCall = JSON.stringify(findOneAndUpdate.mock.calls);
    expect(persistenceCall).toContain('security:operation-1:v1');
    expect(persistenceCall).toContain(DomainEventStatus.PENDING);
    expect(persistenceCall).toContain('"attempts":0');
    expect(persistenceCall).toContain('"upsert":true');
  });
});
