import { registerAs } from '@nestjs/config';

export interface PrivacyConfig {
  exportEncryptionKey: string;
  exportRetentionHours: number;
  deletionGraceDays: number;
  whatsappRetentionDays: number;
  auditRetentionDays: number;
}

export default registerAs('privacy', (): PrivacyConfig => ({
  exportEncryptionKey: process.env.DATA_EXPORT_ENCRYPTION_KEY ?? '',
  exportRetentionHours: 24,
  deletionGraceDays: 7,
  whatsappRetentionDays: 90,
  auditRetentionDays: 2555,
}));
