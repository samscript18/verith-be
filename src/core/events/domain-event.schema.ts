import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';
import { DomainEventName } from './domain-event.contracts';
import { DomainEventStatus } from './domain-event-status.enum';

export type DomainEventOutboxDocument =
  HydratedDocument<DomainEventOutboxRecord>;

@Schema({
  collection: 'domain_event_outbox',
  timestamps: true,
  versionKey: false,
})
export class DomainEventOutboxRecord {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true, unique: true, index: true })
  deduplicationKey!: string;

  @Prop({ required: true, enum: DomainEventName, index: true })
  name!: DomainEventName;

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ required: true, index: true })
  aggregateType!: string;

  @Prop({ required: true, index: true })
  aggregateId!: string;

  @Prop({ required: true, index: true })
  correlationId!: string;

  @Prop({ required: true, type: SchemaTypes.Mixed })
  payload!: Record<string, unknown>;

  @Prop({ required: true })
  occurredAt!: Date;

  @Prop({
    required: true,
    enum: DomainEventStatus,
    default: DomainEventStatus.PENDING,
    index: true,
  })
  status!: DomainEventStatus;

  @Prop({ required: true, default: 0, min: 0 })
  attempts!: number;

  @Prop({ required: true, index: true })
  availableAt!: Date;

  @Prop()
  lockedUntil?: Date;

  @Prop()
  publishedAt?: Date;

  @Prop()
  lastFailureCode?: string;

  @Prop()
  expiresAt?: Date;
}

export const DomainEventOutboxSchema = SchemaFactory.createForClass(
  DomainEventOutboxRecord,
);

DomainEventOutboxSchema.index({ status: 1, availableAt: 1, occurredAt: 1 });
DomainEventOutboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
