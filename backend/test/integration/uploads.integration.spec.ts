import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { UploadsService } from '../../src/api/uploads/uploads.service';
import { AssetType } from '../../src/api/uploads/enums/asset-type.enum';
import {
  CLOUDINARY_PROVIDER,
  type CloudinaryAsset,
  type CloudinaryProvider,
} from '../../src/api/uploads/interfaces/cloudinary-provider.interface';
import { NotFoundException } from '../../src/core/exceptions';

describe('Uploads persistence and ownership (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let uploadsService: UploadsService;
  let providerAsset: CloudinaryAsset;
  const deleteAsset = jest
    .fn<Promise<void>, [string, string]>()
    .mockResolvedValue();
  const provider: CloudinaryProvider = {
    configured: true,
    cloudName: 'test-cloud',
    apiKey: 'test-key',
    sign: () => 'signed-request',
    verifyUploadSignature: () => true,
    getAsset: () => Promise.resolve(providerAsset),
    deleteAsset,
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOUDINARY_PROVIDER)
      .useValue(provider)
      .compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    uploadsService = moduleRef.get(UploadsService);
  });

  afterAll(async () => {
    if (connection) await connection.collection('media_assets').deleteMany({});
    if (moduleRef) await moduleRef.close();
  });

  it('binds confirmation and deletion to the owner', async () => {
    const ownerId = new Types.ObjectId().toString();
    const otherOwnerId = new Types.ObjectId().toString();
    const signed = await uploadsService.createSignature(
      ownerId,
      AssetType.VERIFICATION_IMAGE,
    );
    providerAsset = {
      publicId: signed.publicId,
      resourceType: 'image',
      format: 'png',
      bytes: 2048,
      width: 1200,
      height: 800,
      secureUrl: 'https://res.cloudinary.com/test/image/upload/example.png',
      version: 1,
      ownerId,
      assetId: signed.assetId,
    };

    await expect(
      uploadsService.confirm(otherOwnerId, {
        assetId: signed.assetId,
        version: 1,
        signature: 'response-signature',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const confirmed = await uploadsService.confirm(ownerId, {
      assetId: signed.assetId,
      version: 1,
      signature: 'response-signature',
    });
    expect(confirmed).toMatchObject({
      id: signed.assetId,
      status: 'CONFIRMED',
      bytes: 2048,
      mimeType: 'image/png',
    });

    await expect(
      uploadsService.get(otherOwnerId, signed.assetId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await uploadsService.delete(ownerId, signed.assetId);
    expect(deleteAsset).toHaveBeenCalledWith(signed.publicId, 'image');
    const stored = await connection
      .collection('media_assets')
      .findOne({ _id: new Types.ObjectId(signed.assetId) });
    expect(stored?.status).toBe('DELETED');
    expect(stored?.secureUrl).toBeUndefined();
  });
});
