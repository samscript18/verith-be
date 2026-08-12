import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { NotFoundException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { MailService } from '../../../shared/mail/mail.service';
import { coordinationJobOptions } from '../../../shared/queue/coordination-job-options';
import { User } from '../../users/schemas/user.schema';
import { UserStatus } from '../../users/enums/user-status.enum';
import type { NotificationQueryDto } from '../dto/notification.dto';
import {
  NotificationDeliveryStatus,
  NotificationType,
} from '../enums/notification.enum';
import {
  NOTIFICATION_EMAIL_JOB,
  NOTIFICATION_QUEUE,
} from '../notification.constants';
import {
  Notification,
  type NotificationDocument,
} from '../schemas/notification.schema';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  idempotencyReference: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export type BroadcastNotificationInput = Omit<
  CreateNotificationInput,
  'userId' | 'idempotencyReference'
> & { idempotencyReference: string };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
    private readonly mail: MailService,
  ) {}

  async dispatch(input: CreateNotificationInput) {
    const user = await this.users.findById(input.userId).exec();
    if (!user || user.deletedAt) return null;
    const preference = this.preferenceKey(input.type);
    const essential = input.type === NotificationType.SECURITY_ALERT;
    if (
      !essential &&
      preference &&
      user.notificationPreferences[preference] === false
    )
      return null;
    const emailRequested =
      essential || user.notificationPreferences.emailEnabled !== false;
    const emailEnabled = emailRequested && this.mail.isConfigured();
    const existing = await this.notifications.findOne({
      userId: user._id,
      idempotencyReference: input.idempotencyReference,
    });
    if (existing) return existing;
    let notification: NotificationDocument;
    try {
      notification = await this.notifications.create({
        userId: user._id,
        type: input.type,
        title: input.title,
        message: input.message,
        idempotencyReference: input.idempotencyReference,
        ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
        metadata: input.metadata ?? {},
        emailStatus: emailEnabled
          ? NotificationDeliveryStatus.PENDING
          : !emailRequested
            ? NotificationDeliveryStatus.SKIPPED_PREFERENCE
            : NotificationDeliveryStatus.NOT_CONFIGURED,
      });
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;
      return this.notifications.findOne({
        userId: user._id,
        idempotencyReference: input.idempotencyReference,
      });
    }
    if (emailEnabled) {
      try {
        await this.queue.add(
          NOTIFICATION_EMAIL_JOB,
          { notificationId: notification.id },
          {
            jobId: `notification-email-${notification.id}`,
            ...coordinationJobOptions,
          },
        );
      } catch {
        notification.emailStatus = NotificationDeliveryStatus.FAILED;
        notification.emailFailureCode = 'EMAIL_QUEUE_UNAVAILABLE';
        await notification.save();
        this.logger.warn({
          event: 'notification_email_enqueue_failed',
          notificationId: notification.id,
        });
      }
    }
    return notification;
  }

  async broadcast(input: BroadcastNotificationInput) {
    let cursor: Types.ObjectId | undefined;
    let processedCount = 0;
    let notificationCount = 0;
    do {
      const users = await this.users
        .find({
          status: UserStatus.ACTIVE,
          deletedAt: { $exists: false },
          ...(cursor ? { _id: { $gt: cursor } } : {}),
        })
        .select('_id')
        .sort({ _id: 1 })
        .limit(100)
        .lean()
        .exec();
      if (!users.length) break;
      const results = await Promise.all(
        users.map((user) =>
          this.dispatch({
            ...input,
            userId: user._id.toString(),
            idempotencyReference: `${input.idempotencyReference}:${user._id.toString()}`,
          }),
        ),
      );
      processedCount += users.length;
      notificationCount += results.filter(Boolean).length;
      cursor = users.at(-1)?._id;
      if (users.length < 100) break;
    } while (cursor);
    return { processedCount, notificationCount };
  }

  async deliverEmail(notificationId: string) {
    const notification = await this.notifications.findById(notificationId);
    if (
      !notification ||
      notification.emailStatus === NotificationDeliveryStatus.SENT ||
      notification.emailStatus === NotificationDeliveryStatus.SKIPPED_PREFERENCE
    )
      return;
    const user = await this.users
      .findById(notification.userId)
      .select('email deletedAt notificationPreferences')
      .lean()
      .exec();
    if (!user || user.deletedAt) return;
    const preference = this.preferenceKey(notification.type);
    const essential = notification.type === NotificationType.SECURITY_ALERT;
    if (
      !essential &&
      (user.notificationPreferences.emailEnabled === false ||
        (preference && user.notificationPreferences[preference] === false))
    ) {
      notification.emailStatus = NotificationDeliveryStatus.SKIPPED_PREFERENCE;
      await notification.save();
      return;
    }
    const result = await this.mail.sendNotification(user.email, {
      subject: notification.title,
      message: notification.message,
      type: notification.type,
      metadata: notification.metadata,
      ...(notification.actionUrl ? { actionUrl: notification.actionUrl } : {}),
    });
    notification.emailAttempts += 1;
    notification.emailStatus =
      result.state === ProviderState.OPERATIONAL
        ? NotificationDeliveryStatus.SENT
        : result.state === ProviderState.NOT_CONFIGURED
          ? NotificationDeliveryStatus.NOT_CONFIGURED
          : NotificationDeliveryStatus.FAILED;
    if (result.messageId) notification.emailMessageId = result.messageId;
    if (result.failureCode) notification.emailFailureCode = result.failureCode;
    await notification.save();
    if (result.state === ProviderState.UNAVAILABLE)
      throw new Error('Notification email provider unavailable');
  }

  async list(userId: string, query: NotificationQueryDto) {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      type: { $in: Object.values(NotificationType) },
      deletedAt: { $exists: false },
    };
    if (query.cursor) filter._id = { $lt: new Types.ObjectId(query.cursor) };
    const rows = await this.notifications
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .select('-emailMessageId -emailFailureCode')
      .lean()
      .exec();
    const hasNextPage = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    return {
      data,
      pagination: {
        nextCursor: hasNextPage ? data.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  async unreadCount(userId: string) {
    const unreadCount = await this.notifications.countDocuments({
      userId: new Types.ObjectId(userId),
      type: { $in: Object.values(NotificationType) },
      readAt: { $exists: false },
      deletedAt: { $exists: false },
    });
    return { unreadCount };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.notifications.findOneAndUpdate(
      {
        _id: id,
        userId: new Types.ObjectId(userId),
        deletedAt: { $exists: false },
      },
      { $set: { readAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!notification) throw this.notFound();
    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.notifications.updateMany(
      {
        userId: new Types.ObjectId(userId),
        readAt: { $exists: false },
        deletedAt: { $exists: false },
      },
      { $set: { readAt: new Date() } },
    );
    return { updatedCount: result.modifiedCount };
  }

  async remove(userId: string, id: string) {
    const result = await this.notifications.updateOne(
      {
        _id: id,
        userId: new Types.ObjectId(userId),
        deletedAt: { $exists: false },
      },
      { $set: { deletedAt: new Date() } },
    );
    if (!result.modifiedCount) throw this.notFound();
  }

  private preferenceKey(type: NotificationType): string | undefined {
    const keys: Partial<Record<NotificationType, string>> = {
      [NotificationType.VERIFICATION_COMPLETED]: 'verificationComplete',
      [NotificationType.REPORT_READY]: 'verificationComplete',
      [NotificationType.VERIFICATION_FAILED]: 'verificationFailed',
      [NotificationType.LESSON_RECOMMENDATION]: 'learningRecommendations',
      [NotificationType.DAILY_CHALLENGE]: 'dailyChallenges',
      [NotificationType.STREAK_REMINDER]: 'streakReminders',
      [NotificationType.BADGE_EARNED]: 'gamification',
      [NotificationType.LEVEL_UP]: 'gamification',
      [NotificationType.SYSTEM_MESSAGE]: 'marketing',
    };
    return keys[type];
  }

  private isDuplicate(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private notFound() {
    return new NotFoundException(
      'The notification could not be found',
      'NOTIFICATION_NOT_FOUND',
    );
  }
}
