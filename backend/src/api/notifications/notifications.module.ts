import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { RedisOptions } from 'ioredis';
import type { RedisConfig } from '../../shared/config';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsController } from './controllers/notifications.controller';
import { NOTIFICATION_QUEUE } from './notification.constants';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsService } from './services/notifications.service';
import { NotificationWorker } from './workers/notification.worker';

const redisOptions = (value: string): RedisOptions => {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    ...(url.protocol === 'rediss:'
      ? { tls: { servername: url.hostname } }
      : {}),
    maxRetriesPerRequest: null,
  };
};

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptions(config.getOrThrow<RedisConfig>('redis').url),
        prefix: 'verith:bull',
      }),
    }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorker],
  exports: [NotificationsService, MongooseModule],
})
export class NotificationsModule {}
