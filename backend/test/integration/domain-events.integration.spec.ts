import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import {
  DomainEventName,
  SecurityAlertKind,
} from '../../src/core/events/domain-event.contracts';
import { DomainEventPublisher } from '../../src/core/events/domain-event-publisher.service';
import { DomainEventStatus } from '../../src/core/events/domain-event-status.enum';

describe('Domain event outbox (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let publisher: DomainEventPublisher;
  const deduplicationKey = `integration:domain-event:${new Types.ObjectId().toString()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    publisher = moduleRef.get(DomainEventPublisher);
  });

  afterAll(async () => {
    await connection
      .collection('domain_event_outbox')
      .deleteMany({ deduplicationKey });
    await moduleRef.close();
  });

  it('persists, dispatches, and audits an event through its real consumer', async () => {
    const userId = new Types.ObjectId().toString();
    const published = await publisher.publish({
      name: DomainEventName.SECURITY_ALERT_REQUESTED,
      aggregateType: 'USER',
      aggregateId: userId,
      correlationId: 'integration-domain-event',
      deduplicationKey,
      payload: {
        userId,
        kind: SecurityAlertKind.PASSWORD_CHANGED,
      },
    });

    const record = await waitForPublished(connection, published.id);

    expect(record).toMatchObject({
      eventId: published.id,
      status: DomainEventStatus.PUBLISHED,
      attempts: 0,
    });
    expect(record?.publishedAt).toBeInstanceOf(Date);
    expect(record?.expiresAt).toBeInstanceOf(Date);
  });
});

async function waitForPublished(connection: Connection, eventId: string) {
  const collection = connection.collection('domain_event_outbox');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const record = await collection.findOne({ eventId });
    if (record?.status === DomainEventStatus.PUBLISHED) return record;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return collection.findOne({ eventId });
}
