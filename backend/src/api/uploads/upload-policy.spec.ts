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
    expect(
      getUploadPolicy(AssetType.VERIFICATION_AUDIO, 1000, 2000),
    ).toMatchObject({
      resourceType: 'video',
      maxBytes: 2000,
    });
  });
});
