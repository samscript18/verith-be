import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DomainEventName,
  SecurityAlertKind,
  type DomainEventEnvelope,
} from '../../../core/events/domain-event.contracts';
import { CourseStatus } from '../../learning/enums/learning.enum';
import { Course } from '../../learning/schemas/course.schema';
import { Report } from '../../reports/schemas/report.schema';
import { NotificationType } from '../enums/notification.enum';
import { NotificationsService } from '../services/notifications.service';

@Injectable()
export class DomainNotificationHandler {
  constructor(
    private readonly notifications: NotificationsService,
    @InjectModel(Report.name) private readonly reports: Model<Report>,
    @InjectModel(Course.name) private readonly courses: Model<Course>,
  ) {}

  @OnEvent(DomainEventName.VERIFICATION_COMPLETED)
  async handleVerificationCompleted(
    event: DomainEventEnvelope<DomainEventName.VERIFICATION_COMPLETED>,
  ) {
    await this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.VERIFICATION_COMPLETED,
      title: 'Verification complete',
      message: 'Your Verith verification report is ready to review.',
      actionUrl: `/app/verifications/${encodeURIComponent(event.payload.verificationId)}`,
      idempotencyReference: `event:${event.id}:notification`,
      metadata: {
        verificationId: event.payload.verificationId,
        reportId: event.payload.reportId,
      },
    });

    const report = await this.reports
      .findById(event.payload.reportId)
      .select('learningRecommendations')
      .lean()
      .exec();
    const tags = [
      ...new Set(
        (report?.learningRecommendations ?? []).flatMap((item) =>
          typeof item.tag === 'string' ? [item.tag] : [],
        ),
      ),
    ];
    if (!tags.length) return;
    const course = await this.courses
      .findOne({ status: CourseStatus.PUBLISHED, tags: { $in: tags } })
      .select('title slug difficulty tags')
      .sort({ publishedAt: -1, _id: -1 })
      .lean()
      .exec();
    if (!course) return;
    await this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.LESSON_RECOMMENDATION,
      title: 'A learning path matched your report',
      message: `Continue with “${course.title}” to practise a skill connected to this investigation.`,
      actionUrl: `/app/learning/${encodeURIComponent(course.slug)}`,
      idempotencyReference: `event:${event.id}:learning-recommendation`,
      metadata: {
        reportId: event.payload.reportId,
        courseId: course._id.toString(),
        difficulty: course.difficulty,
      },
    });
  }

  @OnEvent(DomainEventName.VERIFICATION_FAILED)
  handleVerificationFailed(
    event: DomainEventEnvelope<DomainEventName.VERIFICATION_FAILED>,
  ) {
    return this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.VERIFICATION_FAILED,
      title: 'Verification could not be completed',
      message:
        'Your verification could not be completed. You can review its status in Verith.',
      actionUrl: `/app/verifications/${encodeURIComponent(event.payload.verificationId)}`,
      idempotencyReference: `event:${event.id}:notification`,
      metadata: {
        verificationId: event.payload.verificationId,
        failureCode: event.payload.failureCode,
      },
    });
  }

  @OnEvent(DomainEventName.SECURITY_ALERT_REQUESTED)
  handleSecurityAlert(
    event: DomainEventEnvelope<DomainEventName.SECURITY_ALERT_REQUESTED>,
  ) {
    const content =
      event.payload.kind === SecurityAlertKind.PASSWORD_RESET
        ? {
            title: 'Password reset completed',
            message:
              'Your Verith password was reset and existing sessions were revoked.',
          }
        : {
            title: 'Password changed',
            message:
              'Your Verith password changed and existing sessions were revoked.',
          };
    return this.notifications.dispatch({
      userId: event.payload.userId,
      type: NotificationType.SECURITY_ALERT,
      ...content,
      idempotencyReference: `event:${event.id}:notification`,
      metadata: {
        securityAlertKind: event.payload.kind,
      },
    });
  }
}
