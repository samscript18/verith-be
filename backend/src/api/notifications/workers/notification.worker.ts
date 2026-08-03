import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  NOTIFICATION_EMAIL_JOB,
  NOTIFICATION_QUEUE,
} from '../notification.constants';
import { NotificationsService } from '../services/notifications.service';

@Processor(NOTIFICATION_QUEUE, {
  concurrency: 5,
  drainDelay: 60,
  stalledInterval: 120_000,
})
export class NotificationWorker extends WorkerHost {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }
  process(job: Job<{ notificationId: string }>): Promise<void> {
    if (job.name !== NOTIFICATION_EMAIL_JOB) return Promise.resolve();
    return this.notifications.deliverEmail(job.data.notificationId);
  }
}
