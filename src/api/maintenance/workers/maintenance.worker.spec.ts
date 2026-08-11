import type { Job } from 'bullmq';
import { NOTIFICATION_EMAIL_JOB } from '../../notifications/notification.constants';
import { PrivacyJobType } from '../../privacy/enums/privacy-job.enum';
import { WHATSAPP_INBOUND_JOB } from '../../whatsapp/whatsapp.constants';
import { MaintenanceWorker } from './maintenance.worker';

describe('MaintenanceWorker', () => {
  it('routes each durable maintenance job to exactly one service', async () => {
    const notifications = {
      deliverEmail: jest.fn().mockResolvedValue(undefined),
    };
    const privacy = { processExport: jest.fn().mockResolvedValue(undefined) };
    const whatsapp = { processInbound: jest.fn().mockResolvedValue(undefined) };
    const worker = new MaintenanceWorker(
      notifications as never,
      privacy as never,
      whatsapp as never,
    );

    await worker.process(
      job(NOTIFICATION_EMAIL_JOB, { notificationId: 'notification-1' }),
    );
    await worker.process(
      job(String(PrivacyJobType.DATA_EXPORT), {
        privacyJobId: 'privacy-1',
        userId: 'user-1',
      }),
    );
    await worker.process(job(WHATSAPP_INBOUND_JOB, { messageId: 'message-1' }));

    expect(notifications.deliverEmail).toHaveBeenCalledWith('notification-1');
    expect(privacy.processExport).toHaveBeenCalledWith('privacy-1', 'user-1');
    expect(whatsapp.processInbound).toHaveBeenCalledWith({
      messageId: 'message-1',
    });
  });
});

function job(name: string, data: Record<string, string>): Job {
  return { name, data, attemptsMade: 0 } as Job;
}
