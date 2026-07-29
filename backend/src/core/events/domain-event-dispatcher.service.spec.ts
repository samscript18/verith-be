import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Model } from 'mongoose';
import { DomainEventName } from './domain-event.contracts';
import { DomainEventDispatcher } from './domain-event-dispatcher.service';
import type { DomainEventOutboxRecord } from './domain-event.schema';

describe('DomainEventDispatcher', () => {
  afterEach(() => jest.restoreAllMocks());

  it('delivers a claimed event and marks it published', async () => {
    const event = verificationCompletedEvent();
    const model = outboxModel(event);
    const emitter = new EventEmitter2();
    const handler = jest.fn().mockResolvedValue(undefined);
    emitter.on(DomainEventName.VERIFICATION_COMPLETED, handler);
    const dispatcher = new DomainEventDispatcher(model.value, emitter);

    await dispatcher.dispatchPending();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        payload: event.payload,
      }),
    );
    const updates = JSON.stringify(model.updateOne.mock.calls);
    expect(updates).toContain('"status":"PROCESSING"');
    expect(updates).toContain('"status":"PUBLISHED"');
  });

  it('retains an event for retry when no handler is registered', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const model = outboxModel(verificationCompletedEvent());
    const dispatcher = new DomainEventDispatcher(
      model.value,
      new EventEmitter2(),
    );

    await dispatcher.dispatchPending();

    const updates = JSON.stringify(model.updateOne.mock.calls);
    expect(updates).toContain('"status":"FAILED"');
    expect(updates).toContain('"attempts":1');
    expect(updates).toContain('DOMAIN_EVENT_HANDLER_NOT_REGISTERED');
  });
});

function verificationCompletedEvent() {
  return {
    _id: 'outbox-1',
    eventId: 'event-1',
    name: DomainEventName.VERIFICATION_COMPLETED,
    aggregateType: 'VERIFICATION',
    aggregateId: 'verification-1',
    correlationId: 'request-1',
    occurredAt: new Date('2026-07-29T12:00:00.000Z'),
    payload: {
      userId: 'user-1',
      verificationId: 'verification-1',
      reportId: 'report-1',
    },
    attempts: 0,
  };
}

function outboxModel(event: ReturnType<typeof verificationCompletedEvent>) {
  const findOneAndUpdate = jest
    .fn()
    .mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(event),
    })
    .mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
  const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  return {
    findOneAndUpdate,
    updateOne,
    value: {
      findOneAndUpdate,
      updateOne,
    } as unknown as Model<DomainEventOutboxRecord>,
  };
}
