import { registerAs } from '@nestjs/config';

export interface CloudinaryConfig {
  configured: boolean;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  maxImageBytes: number;
  maxAudioBytes: number;
  pendingTtlMinutes: number;
}

export default registerAs('cloudinary', (): CloudinaryConfig => ({
  configured: Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  ),
  cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  apiKey: process.env.CLOUDINARY_API_KEY ?? '',
  apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  folder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'verith',
  maxImageBytes: Number(process.env.MAX_IMAGE_UPLOAD_BYTES ?? 10485760),
  maxAudioBytes: Number(process.env.MAX_AUDIO_UPLOAD_BYTES ?? 26214400),
  pendingTtlMinutes: Number(process.env.UPLOAD_PENDING_TTL_MINUTES ?? 60),
}));
