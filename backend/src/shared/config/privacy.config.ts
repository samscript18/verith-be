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
  exportRetentionHours: Number(process.env.EXPORT_RETENTION_HOURS ?? 24),
  deletionGraceDays: Number(process.env.ACCOUNT_DELETION_GRACE_DAYS ?? 7),
  whatsappRetentionDays: Number(
    process.env.WHATSAPP_METADATA_RETENTION_DAYS ?? 90,
  ),
  auditRetentionDays: Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 2555),
}));
