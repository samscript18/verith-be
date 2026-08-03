import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsController } from './controllers/notifications.controller';
import { NOTIFICATION_QUEUE } from './notification.constants';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsService } from './services/notifications.service';
import { NotificationWorker } from './workers/notification.worker';
import { runsWorkers } from '../../shared/utils/process-role';
import { DomainNotificationHandler } from './handlers/domain-notification.handler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DomainNotificationHandler,
    ...(runsWorkers() ? [NotificationWorker] : []),
  ],
  exports: [NotificationsService, MongooseModule],
})
export class NotificationsModule {}
