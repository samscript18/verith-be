import { registerAs } from '@nestjs/config';

export interface CloudinaryConfig {
  configured: boolean;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  maxImageBytes: number;
  maxAudioBytes: number;
  maxVideoBytes: number;
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
  folder: 'verith',
  maxImageBytes: 10485760,
  maxAudioBytes: 26214400,
  maxVideoBytes: 12582912,
  pendingTtlMinutes: 60,
}));
