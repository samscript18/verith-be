import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { MailConfig } from '../config';
import { ProviderState } from '../enums/provider-state.enum';

export interface MailDeliveryResult {
  state: ProviderState;
  messageId?: string;
  failureCode?: string;
}

@Injectable()
export class MailService {
  private readonly config: MailConfig;
  private readonly transporter?: Transporter;

  constructor(configService: ConfigService) {
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

  async sendActionLink(
    recipient: string,
    subject: string,
    actionUrl: string,
    actionLabel: string,
  ): Promise<MailDeliveryResult> {
    if (!this.transporter) {
      return {
        state: ProviderState.NOT_CONFIGURED,
        failureCode: 'MAIL_NOT_CONFIGURED',
      };
    }

    try {
      const result = (await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to: recipient,
        subject,
        text: `${actionLabel}: ${actionUrl}`,
        html: `<p>${actionLabel}</p><p><a href="${this.escapeHtml(actionUrl)}">${actionLabel}</a></p>`,
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

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
