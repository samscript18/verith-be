import { AssetType } from './enums/asset-type.enum';
import { getUploadPolicy } from './upload-policy';

describe('getUploadPolicy', () => {
  it('uses image constraints for screenshots', () => {
    expect(
      getUploadPolicy(AssetType.VERIFICATION_SCREENSHOT, 1000, 2000),
    ).toMatchObject({
      resourceType: 'image',
      maxBytes: 1000,
    });
  });

  it('uses video-resource audio constraints for voice notes', () => {
    expect(getUploadPolicy(AssetType.VERIFICATION_AUDIO, 1000, 2000)).toEqual({
      resourceType: 'video',
      allowedFormats: ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'flac', 'opus'],
      maxBytes: 2000,
    });
  });

  it('uses a bounded video policy for short clips', () => {
    expect(
      getUploadPolicy(AssetType.VERIFICATION_VIDEO, 1000, 2000, 3000),
    ).toEqual({
      resourceType: 'video',
      allowedFormats: ['mp4', 'webm'],
      maxBytes: 3000,
      maxDurationSeconds: 60,
    });
  });
});
