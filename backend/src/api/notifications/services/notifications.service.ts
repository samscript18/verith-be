import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { NotFoundException } from '../../../core/exceptions';
import { ProviderState } from '../../../shared/enums/provider-state.enum';
import { MailService } from '../../../shared/mail/mail.service';
import { User } from '../../users/schemas/user.schema';
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

@Injectable()
export class NotificationsService {
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
    const emailEnabled =
      essential || user.notificationPreferences.emailEnabled !== false;
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
          : NotificationDeliveryStatus.SKIPPED_PREFERENCE,
      });
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;
      return this.notifications.findOne({
        userId: user._id,
        idempotencyReference: input.idempotencyReference,
      });
    }
    if (emailEnabled)
      await this.queue.add(
        NOTIFICATION_EMAIL_JOB,
        { notificationId: notification.id },
        {
          jobId: `notification-email-${notification.id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    return notification;
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
      .select('email deletedAt')
      .lean()
      .exec();
    if (!user || user.deletedAt) return;
    const result = await this.mail.sendNotification(
      user.email,
      notification.title,
      notification.message,
      notification.actionUrl,
    );
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
