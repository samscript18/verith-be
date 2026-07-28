import { AssetType } from './enums/asset-type.enum';

export interface UploadPolicy {
  resourceType: 'image' | 'video';
  allowedFormats: string[];
  maxBytes: number;
}

const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'aac', 'flac'];

export function getUploadPolicy(
  assetType: AssetType,
  maxImageBytes: number,
  maxAudioBytes: number,
): UploadPolicy {
  if (assetType === AssetType.VERIFICATION_AUDIO) {
    return {
      resourceType: 'video',
      allowedFormats: AUDIO_FORMATS,
      maxBytes: maxAudioBytes,
    };
  }
  return {
    resourceType: 'image',
    allowedFormats: IMAGE_FORMATS,
    maxBytes: maxImageBytes,
  };
}
