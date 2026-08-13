import { ConfigService } from '@nestjs/config';
import { Types, type Model } from 'mongoose';
import type { CloudinaryConfig } from '../../shared/config';
import { ConflictException } from '../../core/exceptions';
import { AssetStatus } from './enums/asset-status.enum';
import { AssetType } from './enums/asset-type.enum';
import type {
  CloudinaryAsset,
  CloudinaryProvider,
} from './interfaces/cloudinary-provider.interface';
import type { MediaAsset } from './schemas/media-asset.schema';
import { UploadsService } from './uploads.service';

describe('UploadsService video confirmation', () => {
  const ownerId = new Types.ObjectId().toString();
  const assetObjectId = new Types.ObjectId();
  const assetId = assetObjectId.toString();
  const publicId = `verith/users/${ownerId}/verification_video/${assetId}-file`;
  const config: CloudinaryConfig = {
    configured: true,
    cloudName: 'test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    folder: 'verith',
    maxImageBytes: 10_485_760,
    maxAudioBytes: 26_214_400,
    maxVideoBytes: 12_582_912,
    pendingTtlMinutes: 60,
  };

  const providerVideo: CloudinaryAsset = {
    providerAssetId: 'cloudinary-asset-id',
    publicId,
    resourceType: 'video',
    deliveryType: 'upload',
    format: 'mp4',
    bytes: 1_048_576,
    width: 1280,
    height: 720,
    duration: 42.5,
    secureUrl: `https://res.cloudinary.com/test-cloud/video/upload/v7/${publicId}.mp4`,
    version: 7,
    ownerId,
    assetId,
  };

  function setup(
    overrides: Partial<CloudinaryAsset> = {},
    assetType: AssetType = AssetType.VERIFICATION_VIDEO,
    omitDuration = false,
  ) {
    const imageAsset = [
      AssetType.VERIFICATION_IMAGE,
      AssetType.VERIFICATION_SCREENSHOT,
    ].includes(assetType);
    const audioAsset = assetType === AssetType.VERIFICATION_AUDIO;
    const normalizedProviderAsset: CloudinaryAsset = {
      ...providerVideo,
      resourceType: imageAsset ? 'image' : 'video',
      format: imageAsset ? 'jpg' : audioAsset ? 'mp3' : 'mp4',
      ...overrides,
    };
    if (omitDuration) delete normalizedProviderAsset.duration;
    const pendingAsset = {
      _id: assetObjectId,
      id: assetId,
      ownerId: new Types.ObjectId(ownerId),
      assetType,
      provider: 'CLOUDINARY',
      publicId,
      resourceType: imageAsset ? 'image' : 'video',
      status: AssetStatus.PENDING,
      deleteAfter: new Date(Date.now() + 60_000),
      metadata: {
        allowedFormats: ['mp4', 'webm'],
        maxBytes: config.maxVideoBytes,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const confirmedAsset = {
      ...pendingAsset,
      status: AssetStatus.CONFIRMED,
      ...normalizedProviderAsset,
      mimeType: imageAsset
        ? 'image/jpeg'
        : audioAsset
          ? 'audio/mp3'
          : `video/${normalizedProviderAsset.format}`,
      signatureVerifiedAt: new Date(),
    };
    const findOneExec = jest.fn().mockResolvedValue(pendingAsset);
    const updateExec = jest.fn().mockResolvedValue(confirmedAsset);
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: updateExec });
    const assetModel = {
      findOne: jest.fn().mockReturnValue({ exec: findOneExec }),
      findOneAndUpdate,
    } as unknown as Model<MediaAsset>;
    const verifyUploadSignature = jest.fn().mockReturnValue(true);
    const getAsset = jest.fn().mockResolvedValue(normalizedProviderAsset);
    const cloudinary: CloudinaryProvider = {
      configured: true,
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      sign: jest.fn().mockReturnValue('signed'),
      verifyUploadSignature,
      getAsset,
      deleteAsset: jest.fn(),
    };
    const service = new UploadsService(
      assetModel,
      cloudinary,
      new ConfigService({ cloudinary: config }),
    );
    return {
      cloudinary,
      findOneAndUpdate,
      findOneExec,
      getAsset,
      service,
      verifyUploadSignature,
    };
  }

  it('confirms a canonical Cloudinary video and persists integrity metadata', async () => {
    const { findOneAndUpdate, service } = setup();

    await expect(
      service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      }),
    ).resolves.toMatchObject({
      id: assetId,
      resourceType: 'video',
      format: 'mp4',
      duration: 42.5,
    });

    const updateCall = findOneAndUpdate.mock.calls[0] as
      | [unknown, { $set: { metadata: Record<string, unknown> } }, unknown]
      | undefined;
    expect(updateCall?.[0]).toMatchObject({ _id: assetObjectId });
    expect(updateCall?.[1].$set.metadata).toMatchObject({
      providerAssetId: 'cloudinary-asset-id',
      deliveryType: 'upload',
      uploadPolicyId: assetId,
      integrityStatus: 'VERIFIED',
    });
  });

  it.each([
    [AssetType.VERIFICATION_IMAGE, 'image', 'jpg'],
    [AssetType.VERIFICATION_SCREENSHOT, 'image', 'png'],
    [AssetType.VERIFICATION_AUDIO, 'video', 'mp3'],
    [AssetType.VERIFICATION_AUDIO, 'video', 'opus'],
    [AssetType.VERIFICATION_VIDEO, 'video', 'mp4'],
    [AssetType.VERIFICATION_VIDEO, 'video', 'webm'],
  ])(
    'confirms %s through the shared canonical pipeline',
    async (assetType, resourceType, format) => {
      const { service } = setup({ resourceType, format }, assetType);
      await expect(
        service.confirm(ownerId, {
          assetId,
          signature: 'upload-response-signature',
          version: 7,
        }),
      ).resolves.toMatchObject({ resourceType, format });
    },
  );

  it('accepts Cloudinary Opus metadata only for an audio investigation', async () => {
    const { findOneAndUpdate, service } = setup(
      { resourceType: 'video', format: 'opus' },
      AssetType.VERIFICATION_AUDIO,
    );

    await expect(
      service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      }),
    ).resolves.toMatchObject({ resourceType: 'video', format: 'opus' });

    const update = (
      findOneAndUpdate.mock.calls as unknown as Array<
        [unknown, { $set: Record<string, unknown> }, unknown]
      >
    )[0]?.[1];
    expect(update).toMatchObject({
      $set: { format: 'opus', mimeType: 'audio/opus' },
    });

    const video = setup(
      { resourceType: 'video', format: 'opus' },
      AssetType.VERIFICATION_VIDEO,
    );
    await expect(
      video.service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      }),
    ).rejects.toMatchObject({
      code: 'UPLOAD_POLICY_MISMATCH',
      details: { field: 'format' },
    });
  });

  it('rejects an invalid signature before provider lookup', async () => {
    const { getAsset, service, verifyUploadSignature } = setup();
    verifyUploadSignature.mockReturnValue(false);
    await expect(
      service.confirm(ownerId, { assetId, signature: 'invalid', version: 7 }),
    ).rejects.toMatchObject({ code: 'UPLOAD_SIGNATURE_INVALID' });
    expect(getAsset).not.toHaveBeenCalled();
  });

  it('reports a provider asset that cannot be retrieved', async () => {
    const { getAsset, service } = setup();
    getAsset.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      }),
    ).rejects.toThrow('provider unavailable');
  });

  it('treats missing provider duration as temporary metadata unavailability', async () => {
    const { service } = setup({}, AssetType.VERIFICATION_VIDEO, true);
    await expect(
      service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      }),
    ).rejects.toMatchObject({
      code: 'CLOUDINARY_DURATION_UNAVAILABLE',
    });
  });

  it('rejects expired or replayed pending records', async () => {
    const { findOneExec, service } = setup();
    findOneExec.mockResolvedValueOnce(null);
    await expect(
      service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_NOT_FOUND' });
  });

  it.each([
    ['publicId', { publicId: `${publicId}-tampered` }],
    ['resourceType', { resourceType: 'image' }],
    ['deliveryType', { deliveryType: 'authenticated' }],
    ['owner', { ownerId: new Types.ObjectId().toString() }],
    ['uploadPolicyId', { assetId: new Types.ObjectId().toString() }],
    ['version', { version: 8 }],
    ['format', { format: 'mov' }],
    ['fileSize', { bytes: config.maxVideoBytes + 1 }],
    ['duration', { duration: 61 }],
    ['secureUrl', { secureUrl: 'http://example.com/video.mp4' }],
  ])('reports the safe %s policy mismatch', async (field, overrides) => {
    const { service } = setup(overrides);

    try {
      await service.confirm(ownerId, {
        assetId,
        signature: 'upload-response-signature',
        version: 7,
      });
      throw new Error('Expected confirmation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.code).toBe('UPLOAD_POLICY_MISMATCH');
      expect(error.details).toMatchObject({ field });
    }
  });

  it('deletes expired unattached pending uploads after provider acknowledgement', async () => {
    const expiredAsset = {
      _id: assetObjectId,
      publicId,
      resourceType: 'video',
      status: AssetStatus.PENDING,
    };
    const find = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([expiredAsset]),
      }),
    });
    const updateOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    const deleteAsset = jest.fn().mockResolvedValue(undefined);
    const cloudinary: CloudinaryProvider = {
      configured: true,
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      sign: jest.fn(),
      verifyUploadSignature: jest.fn(),
      getAsset: jest.fn(),
      deleteAsset,
    };
    const service = new UploadsService(
      { find, updateOne } as unknown as Model<MediaAsset>,
      cloudinary,
      new ConfigService({ cloudinary: config }),
    );

    await expect(service.cleanupExpiredPending()).resolves.toBe(1);
    const filter = (
      find.mock.calls as unknown as Array<[Record<string, unknown>]>
    )[0]?.[0];
    expect(filter?.status).toBe(AssetStatus.PENDING);
    expect(
      (filter?.deleteAfter as { $lte?: unknown } | undefined)?.$lte,
    ).toBeInstanceOf(Date);
    expect(deleteAsset).toHaveBeenCalledWith(publicId, 'video');
  });

  it('reschedules cleanup when provider deletion is not confirmed', async () => {
    const expiredAsset = {
      _id: assetObjectId,
      publicId,
      resourceType: 'video',
      status: AssetStatus.PENDING,
    };
    const updateOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    const cloudinary: CloudinaryProvider = {
      configured: true,
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      sign: jest.fn(),
      verifyUploadSignature: jest.fn(),
      getAsset: jest.fn(),
      deleteAsset: jest.fn().mockRejectedValue(new Error('delete failed')),
    };
    const service = new UploadsService(
      {
        find: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([expiredAsset]),
          }),
        }),
        updateOne,
      } as unknown as Model<MediaAsset>,
      cloudinary,
      new ConfigService({ cloudinary: config }),
    );

    await expect(service.cleanupExpiredPending()).resolves.toBe(0);
    const update = (
      updateOne.mock.calls as unknown as Array<
        [unknown, { $set?: Record<string, unknown> }]
      >
    )[0]?.[1];
    expect(update?.$set).toMatchObject({
      'metadata.cleanupFailureCode': 'CLOUDINARY_DELETE_FAILED',
    });
  });
});
