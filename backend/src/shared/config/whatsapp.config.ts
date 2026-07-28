import { registerAs } from '@nestjs/config';

export interface WhatsAppConfig {
  enabled: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
  baseUrl: string;
  reportDeepLinkBase: string;
  hashingPepper: string;
  encryptionKey: string;
  maxImageBytes: number;
  maxAudioBytes: number;
}
export default registerAs('whatsapp', (): WhatsAppConfig => ({
  enabled: process.env.WHATSAPP_ENABLED === 'true',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
  appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v23.0',
  baseUrl: process.env.WHATSAPP_BASE_URL ?? 'https://graph.facebook.com',
  reportDeepLinkBase: process.env.WHATSAPP_REPORT_DEEP_LINK_BASE ?? '',
  hashingPepper: process.env.HASHING_PEPPER ?? '',
  encryptionKey: process.env.MASTER_ENCRYPTION_KEY ?? '',
  maxImageBytes: Number(process.env.MAX_IMAGE_UPLOAD_BYTES ?? 10485760),
  maxAudioBytes: Number(process.env.MAX_AUDIO_UPLOAD_BYTES ?? 26214400),
}));
