import { registerAs } from '@nestjs/config';

export interface PrivacyConfig {
  exportEncryptionKey: string;
  exportRetentionHours: number;
  deletionGraceDays: number;
  auditRetentionDays: number;
}

export default registerAs('privacy', (): PrivacyConfig => ({
  exportEncryptionKey: process.env.DATA_EXPORT_ENCRYPTION_KEY ?? '',
  exportRetentionHours: 24,
  deletionGraceDays: 7,
  auditRetentionDays: 2555,
}));
