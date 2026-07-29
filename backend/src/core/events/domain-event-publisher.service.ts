import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import type {
  DomainEventEnvelope,
  DomainEventName,
  PublishDomainEventInput,
} from './domain-event.contracts';
import {
  DomainEventOutboxRecord,
  type DomainEventOutboxDocument,
} from './domain-event.schema';
import { DomainEventStatus } from './domain-event-status.enum';

@Injectable()
export class DomainEventPublisher {
  constructor(
    @InjectModel(DomainEventOutboxRecord.name)
    private readonly events: Model<DomainEventOutboxRecord>,
  ) {}

  async publish<TName extends DomainEventName>(
    input: PublishDomainEventInput<TName>,
  ): Promise<DomainEventEnvelope<TName>> {
    const occurredAt = new Date();
    const event = await this.events
      .findOneAndUpdate(
        { deduplicationKey: input.deduplicationKey },
        {
          $setOnInsert: {
            eventId: randomUUID(),
            deduplicationKey: input.deduplicationKey,
            name: input.name,
            version: 1,
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
            correlationId: input.correlationId,
            payload: input.payload,
            occurredAt,
            status: DomainEventStatus.PENDING,
            attempts: 0,
            availableAt: occurredAt,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();
    if (!event) throw new Error('Domain event could not be persisted');
    return this.toEnvelope<TName>(event);
  }

  private toEnvelope<TName extends DomainEventName>(
    event: DomainEventOutboxDocument,
  ): DomainEventEnvelope<TName> {
    return {
      id: event.eventId,
      name: event.name as TName,
      version: 1,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      occurredAt: event.occurredAt,
      payload:
        event.payload as unknown as DomainEventEnvelope<TName>['payload'],
    };
  }
}
