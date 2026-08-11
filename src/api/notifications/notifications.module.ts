import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsAdminController } from './controllers/notifications-admin.controller';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsService } from './services/notifications.service';
import { DomainNotificationHandler } from './handlers/domain-notification.handler';
import { MaintenanceQueueModule } from '../maintenance/maintenance-queue.module';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import { Course, CourseSchema } from '../learning/schemas/course.schema';
import {
  GamificationProfile,
  GamificationProfileSchema,
} from '../gamification/schemas/gamification-profile.schema';
import { NotificationScheduleService } from './services/notification-schedule.service';
import { runsScheduler } from '../../shared/utils/process-role';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Report.name, schema: ReportSchema },
      { name: Course.name, schema: CourseSchema },
      { name: GamificationProfile.name, schema: GamificationProfileSchema },
    ]),
    MaintenanceQueueModule,
    AdminModule,
  ],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    NotificationsService,
    DomainNotificationHandler,
    ...(runsScheduler() ? [NotificationScheduleService] : []),
  ],
  exports: [NotificationsService, MongooseModule],
})
export class NotificationsModule {}
