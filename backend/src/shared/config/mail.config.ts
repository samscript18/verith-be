import { registerAs } from '@nestjs/config';

export interface MailConfig {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export default registerAs('mail', (): MailConfig => ({
  configured: Boolean(
    process.env.MAIL_HOST &&
    process.env.MAIL_USER &&
    process.env.MAIL_PASSWORD &&
    process.env.MAIL_FROM_EMAIL,
  ),
  host: process.env.MAIL_HOST ?? '',
  port: Number(process.env.MAIL_PORT ?? 587),
  secure: process.env.MAIL_SECURE === 'true',
  user: process.env.MAIL_USER ?? '',
  password: process.env.MAIL_PASSWORD ?? '',
  fromName: process.env.MAIL_FROM_NAME ?? 'Verith',
  fromEmail: process.env.MAIL_FROM_EMAIL ?? '',
}));
