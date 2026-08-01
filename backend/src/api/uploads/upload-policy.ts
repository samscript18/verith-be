import { AssetType } from './enums/asset-type.enum';

export interface UploadPolicy {
  resourceType: 'image' | 'video';
  allowedFormats: string[];
  maxBytes: number;
  maxDurationSeconds?: number;
}

const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'flac'];
const VIDEO_FORMATS = ['mp4', 'webm'];

export function getUploadPolicy(
  assetType: AssetType,
  maxImageBytes: number,
  maxAudioBytes: number,
  maxVideoBytes = maxAudioBytes,
): UploadPolicy {
  if (assetType === AssetType.VERIFICATION_AUDIO) {
    return {
      resourceType: 'video',
      allowedFormats: AUDIO_FORMATS,
      maxBytes: maxAudioBytes,
    };
  }
  if (assetType === AssetType.VERIFICATION_VIDEO) {
    return {
      resourceType: 'video',
      allowedFormats: VIDEO_FORMATS,
      maxBytes: maxVideoBytes,
      maxDurationSeconds: 60,
    };
  }
  return {
    resourceType: 'image',
    allowedFormats: IMAGE_FORMATS,
    maxBytes: maxImageBytes,
  };
}
