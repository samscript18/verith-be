import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATION_EMAIL_JOB } from '../../notifications/notification.constants';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { PrivacyJobType } from '../../privacy/enums/privacy-job.enum';
import type { PrivacyQueueJob } from '../../privacy/interfaces/privacy-job.interface';
import { PrivacyService } from '../../privacy/services/privacy.service';
import { MAINTENANCE_QUEUE } from '../maintenance.constants';

@Processor(MAINTENANCE_QUEUE, {
  concurrency: 3,
  drainDelay: 300,
  stalledInterval: 600_000,
})
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly privacy: PrivacyService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.debug({
      event: 'maintenance_job_started',
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    });
    if (job.name === NOTIFICATION_EMAIL_JOB) {
      await this.notifications.deliverEmail(
        (job.data as { notificationId: string }).notificationId,
      );
      return;
    }
    if (job.name === String(PrivacyJobType.DATA_EXPORT)) {
      const data = job.data as PrivacyQueueJob;
      await this.privacy.processExport(data.privacyJobId, data.userId);
      return;
    }
    this.logger.warn({
      event: 'maintenance_job_ignored',
      jobName: job.name,
    });
  }
}
