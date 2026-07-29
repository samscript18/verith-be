import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { runsScheduler } from '../../shared/utils/process-role';
import {
  DomainEventOutboxRecord,
  DomainEventOutboxSchema,
} from './domain-event.schema';
import { DomainEventDispatcher } from './domain-event-dispatcher.service';
import { DomainEventPublisher } from './domain-event-publisher.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DomainEventOutboxRecord.name,
        schema: DomainEventOutboxSchema,
      },
    ]),
  ],
  providers: [
    DomainEventPublisher,
    ...(runsScheduler() && process.env.OPENAPI_EXPORT !== 'true'
      ? [DomainEventDispatcher]
      : []),
  ],
  exports: [DomainEventPublisher, MongooseModule],
})
export class DomainEventsModule {}
