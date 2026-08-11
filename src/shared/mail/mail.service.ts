import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig, MailConfig } from '../config';
import { ProviderState } from '../enums/provider-state.enum';
import {
  renderGenericNotificationTemplate,
  renderPasswordChangedTemplate,
  renderPasswordResetTemplate,
  renderSecurityAlertTemplate,
  renderVerificationCompletedTemplate,
  renderVerificationFailedTemplate,
  renderVerifyEmailTemplate,
  type RenderedMailTemplate,
} from './templates';

export interface MailDeliveryResult {
  state: ProviderState;
  messageId?: string;
  failureCode?: string;
}

export interface NotificationMailInput {
  subject: string;
  message: string;
  actionUrl?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MailService {
  private readonly appConfig: AppConfig;
  private readonly config: MailConfig;
  private readonly transporter?: Transporter;

  constructor(configService: ConfigService) {
    this.appConfig = configService.getOrThrow<AppConfig>('app');
    this.config = configService.getOrThrow<MailConfig>('mail');
    if (this.config.configured) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.password },
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  sendEmailVerification(
    recipient: string,
    actionUrl: string,
    expiresInMinutes: number,
  ): Promise<MailDeliveryResult> {
    return this.renderAndDeliver(recipient, () =>
      renderVerifyEmailTemplate({
        actionUrl,
        expiresInMinutes,
        productUrl: this.appConfig.frontendUrl,
      }),
    );
  }

  sendPasswordReset(
    recipient: string,
    actionUrl: string,
    expiresInMinutes: number,
  ): Promise<MailDeliveryResult> {
    return this.renderAndDeliver(recipient, () =>
      renderPasswordResetTemplate({
        actionUrl,
        expiresInMinutes,
        productUrl: this.appConfig.frontendUrl,
      }),
    );
  }

  sendNotification(
    recipient: string,
    input: NotificationMailInput,
  ): Promise<MailDeliveryResult> {
    return this.renderAndDeliver(recipient, () =>
      this.notificationTemplate(input),
    );
  }

  private notificationTemplate(
    input: NotificationMailInput,
  ): RenderedMailTemplate {
    const shared = {
      subject: input.subject,
      message: input.message,
      productUrl: this.appConfig.frontendUrl,
      ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    if (
      input.type === 'VERIFICATION_COMPLETED' ||
      input.type === 'REPORT_READY'
    ) {
      return renderVerificationCompletedTemplate(shared);
    }
    if (input.type === 'VERIFICATION_FAILED') {
      return renderVerificationFailedTemplate(shared);
    }
    if (input.type === 'SECURITY_ALERT') {
      const securityAlertKind =
        input.metadata?.securityAlertKind ??
        (input.subject === 'Password changed'
          ? 'PASSWORD_CHANGED'
          : input.subject === 'Password reset completed'
            ? 'PASSWORD_RESET'
            : undefined);
      if (securityAlertKind === 'PASSWORD_CHANGED') {
        return renderPasswordChangedTemplate({
          message: input.message,
          productUrl: this.appConfig.frontendUrl,
        });
      }
      return renderSecurityAlertTemplate({
        ...shared,
        ...(securityAlertKind
          ? {
              metadata: {
                ...input.metadata,
                securityAlertKind,
              },
            }
          : {}),
      });
    }
    return renderGenericNotificationTemplate({
      ...shared,
      ...(input.type ? { type: input.type } : {}),
    });
  }

  private renderAndDeliver(
    recipient: string,
    render: () => RenderedMailTemplate,
  ): Promise<MailDeliveryResult> {
    try {
      return this.deliver(recipient, render());
    } catch {
      return Promise.resolve({
        state: ProviderState.UNAVAILABLE,
        failureCode: 'MAIL_TEMPLATE_INVALID',
      });
    }
  }

  private async deliver(
    recipient: string,
    template: RenderedMailTemplate,
  ): Promise<MailDeliveryResult> {
    if (!this.transporter) {
      return {
        state: ProviderState.NOT_CONFIGURED,
        failureCode: 'MAIL_NOT_CONFIGURED',
      };
    }

    try {
      const result = (await this.transporter.sendMail({
        from: {
          name: this.config.fromName,
          address: this.config.fromEmail,
        },
        to: recipient,
        subject: template.subject,
        text: template.text,
        html: template.html,
      })) as unknown;
      const messageId = this.getMessageId(result);
      return {
        state: ProviderState.OPERATIONAL,
        ...(messageId ? { messageId } : {}),
      };
    } catch {
      return {
        state: ProviderState.UNAVAILABLE,
        failureCode: 'MAIL_DELIVERY_FAILED',
      };
    }
  }

  private getMessageId(value: unknown): string | undefined {
    if (
      typeof value === 'object' &&
      value !== null &&
      'messageId' in value &&
      typeof value.messageId === 'string'
    ) {
      return value.messageId;
    }
    return undefined;
  }
}
