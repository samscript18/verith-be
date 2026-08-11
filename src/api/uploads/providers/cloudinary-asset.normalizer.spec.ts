import { normalizeCloudinaryAsset } from './cloudinary-asset.normalizer';

describe('normalizeCloudinaryAsset', () => {
  it('normalizes the Cloudinary video resource response and nested context', () => {
    expect(
      normalizeCloudinaryAsset({
        asset_id: 'provider-asset-id',
        public_id: 'verith/users/owner/video/policy-file',
        resource_type: 'video',
        type: 'upload',
        format: 'mp4',
        bytes: 1_234_567,
        width: 1280,
        height: 720,
        duration: 42.25,
        secure_url:
          'https://res.cloudinary.com/demo/video/upload/v7/verith/video.mp4',
        version: 7,
        context: {
          custom: {
            owner_id: 'owner',
            asset_id: 'policy',
          },
        },
      }),
    ).toEqual({
      providerAssetId: 'provider-asset-id',
      publicId: 'verith/users/owner/video/policy-file',
      resourceType: 'video',
      deliveryType: 'upload',
      format: 'mp4',
      bytes: 1_234_567,
      width: 1280,
      height: 720,
      duration: 42.25,
      secureUrl:
        'https://res.cloudinary.com/demo/video/upload/v7/verith/video.mp4',
      version: 7,
      ownerId: 'owner',
      assetId: 'policy',
    });
  });

  it('rejects an incomplete provider response', () => {
    try {
      normalizeCloudinaryAsset({ public_id: 'incomplete' });
      throw new Error('Expected normalization to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'CLOUDINARY_INVALID_RESPONSE' });
    }
  });

  it('normalizes numeric strings returned by provider transports', () => {
    expect(
      normalizeCloudinaryAsset({
        public_id: 'verith/video',
        resource_type: 'video',
        type: 'upload',
        format: 'webm',
        bytes: '2048',
        duration: '12.5',
        secure_url: 'https://res.cloudinary.com/demo/video.webm',
        version: '9',
      }),
    ).toMatchObject({ bytes: 2048, duration: 12.5, version: 9 });
  });

  it.each([
    [{ media_metadata: { duration: '14.02' } }, 14.02],
    [{ media_metadata: { video_duration: 14.03 } }, 14.03],
    [{ video: { duration: '14.04' } }, 14.04],
    [{ video_duration: '14.05' }, 14.05],
    [{ format_duration: 14.06 }, 14.06],
  ])('normalizes provider duration variants from %o', (variant, duration) => {
    expect(
      normalizeCloudinaryAsset({
        public_id: 'verith/video',
        resource_type: 'video',
        type: 'upload',
        format: 'mp4',
        bytes: 2048,
        secure_url: 'https://res.cloudinary.com/demo/video.mp4',
        version: 9,
        ...variant,
      }),
    ).toMatchObject({ duration });
  });
});
