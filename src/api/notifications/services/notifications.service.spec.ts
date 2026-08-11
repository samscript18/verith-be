import {
  NotificationDeliveryStatus,
  NotificationType,
} from '../enums/notification.enum';
import { NotificationsService } from './notifications.service';

describe('NotificationsService preferences and delivery', () => {
  it('does not persist or email a disabled notification category', async () => {
    const notifications = { create: jest.fn() };
    const users = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: 'user-1',
          notificationPreferences: { dailyChallenges: false },
        }),
      }),
    };
    const queue = { add: jest.fn() };
    const mail = { isConfigured: jest.fn().mockReturnValue(true) };
    const service = new NotificationsService(
      notifications as never,
      users as never,
      queue as never,
      mail as never,
    );

    const result = await service.dispatch({
      userId: 'user-1',
      type: NotificationType.DAILY_CHALLENGE,
      title: 'Daily practice',
      message: 'Ready',
      idempotencyReference: 'daily:2026-08-08',
    });

    expect(result).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('persists in-app delivery without creating a queue job when mail is unavailable', async () => {
    const notification = { id: 'notification-1' };
    const notifications = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(notification),
    };
    const users = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: 'user-1',
          notificationPreferences: {},
        }),
      }),
    };
    const queue = { add: jest.fn() };
    const mail = { isConfigured: jest.fn().mockReturnValue(false) };
    const service = new NotificationsService(
      notifications as never,
      users as never,
      queue as never,
      mail as never,
    );

    await service.dispatch({
      userId: 'user-1',
      type: NotificationType.SYSTEM_MESSAGE,
      title: 'Product update',
      message: 'A real update',
      idempotencyReference: 'product:update-1',
    });

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emailStatus: NotificationDeliveryStatus.NOT_CONFIGURED,
      }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('honors preferences changed after an email job was queued', async () => {
    const notification = {
      type: NotificationType.BADGE_EARNED,
      emailStatus: NotificationDeliveryStatus.PENDING,
      save: jest.fn(),
    };
    const notifications = {
      findById: jest.fn().mockResolvedValue(notification),
    };
    const users = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              email: 'member@example.com',
              notificationPreferences: { gamification: false },
            }),
          }),
        }),
      }),
    };
    const mail = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendNotification: jest.fn(),
    };
    const service = new NotificationsService(
      notifications as never,
      users as never,
      {} as never,
      mail as never,
    );

    await service.deliverEmail('notification-1');

    expect(notification.emailStatus).toBe(
      NotificationDeliveryStatus.SKIPPED_PREFERENCE,
    );
    expect(notification.save).toHaveBeenCalledTimes(1);
    expect(mail.sendNotification).not.toHaveBeenCalled();
  });
});
