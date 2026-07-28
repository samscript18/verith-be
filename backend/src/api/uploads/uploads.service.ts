import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { CloudinaryConfig } from '../../shared/config';
import {
  ConflictException,
  ExternalProviderException,
  NotFoundException,
} from '../../core/exceptions';
import type { ConfirmUploadDto } from './dto/upload.dto';
import { AssetStatus } from './enums/asset-status.enum';
import { AssetType } from './enums/asset-type.enum';
import {
  CLOUDINARY_PROVIDER,
  type CloudinaryAsset,
  type CloudinaryProvider,
} from './interfaces/cloudinary-provider.interface';
import {
  MediaAsset,
  type MediaAssetDocument,
} from './schemas/media-asset.schema';
import { getUploadPolicy } from './upload-policy';

export interface SignedUploadResult {
  assetId: string;
  provider: 'CLOUDINARY';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: string;
  context: string;
  allowedFormats: string[];
  maxBytes: number;
  expiresAt: Date;
}

@Injectable()
export class UploadsService {
  private readonly config: CloudinaryConfig;

  constructor(
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAsset>,
    @Inject(CLOUDINARY_PROVIDER)
    private readonly cloudinary: CloudinaryProvider,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<CloudinaryConfig>('cloudinary');
  }

  async createSignature(
    ownerId: string,
    assetType: AssetType,
  ): Promise<SignedUploadResult> {
    this.assertConfigured();
    const policy = getUploadPolicy(
      assetType,
      this.config.maxImageBytes,
      this.config.maxAudioBytes,
    );
    const assetId = new Types.ObjectId();
    const publicId = [
      this.config.folder,
      'users',
      ownerId,
      assetType.toLowerCase(),
      `${assetId.toString()}-${randomUUID()}`,
    ].join('/');
    const expiresAt = new Date(
      Date.now() + this.config.pendingTtlMinutes * 60 * 1000,
    );
    const context = `owner_id=${ownerId}|asset_id=${assetId.toString()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const parameters = {
      public_id: publicId,
      timestamp,
      context,
      overwrite: false,
    };

    await this.assetModel.create({
      _id: assetId,
      ownerId: new Types.ObjectId(ownerId),
      assetType,
      publicId,
      resourceType: policy.resourceType,
      status: AssetStatus.PENDING,
      deleteAfter: expiresAt,
      metadata: {
        allowedFormats: policy.allowedFormats,
        maxBytes: policy.maxBytes,
      },
    });

    return {
      assetId: assetId.toString(),
      provider: 'CLOUDINARY',
      cloudName: this.cloudinary.cloudName,
      apiKey: this.cloudinary.apiKey,
      timestamp,
      signature: this.cloudinary.sign(parameters),
      publicId,
      resourceType: policy.resourceType,
      context,
      allowedFormats: policy.allowedFormats,
      maxBytes: policy.maxBytes,
      expiresAt,
    };
  }

  async confirm(
    ownerId: string,
    dto: ConfirmUploadDto,
    expectedType?: AssetType,
  ): Promise<Record<string, unknown>> {
    this.assertConfigured();
    const asset = await this.findOwnedPending(ownerId, dto.assetId);
    if (expectedType && asset.assetType !== expectedType) {
      throw new ConflictException(
        'The media asset type does not match this upload flow',
        'UPLOAD_ASSET_TYPE_MISMATCH',
      );
    }
    if (
      !this.cloudinary.verifyUploadSignature(
        asset.publicId,
        dto.version,
        dto.signature,
      )
    ) {
      throw new ConflictException(
        'The upload signature is invalid',
        'UPLOAD_SIGNATURE_INVALID',
      );
    }

    const providerAsset = await this.cloudinary.getAsset(
      asset.publicId,
      asset.resourceType,
    );
    this.validateProviderAsset(asset, providerAsset, ownerId, dto.version);
    const mimeType = this.mimeType(providerAsset, asset.assetType);
    const confirmed = await this.assetModel
      .findOneAndUpdate(
        {
          _id: asset._id,
          ownerId: new Types.ObjectId(ownerId),
          status: AssetStatus.PENDING,
        },
        {
          $set: {
            status: AssetStatus.CONFIRMED,
            format: providerAsset.format,
            mimeType,
            bytes: providerAsset.bytes,
            width: providerAsset.width,
            height: providerAsset.height,
            duration: providerAsset.duration,
            secureUrl: providerAsset.secureUrl,
            providerVersion: providerAsset.version,
            signatureVerifiedAt: new Date(),
          },
          $unset: { deleteAfter: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!confirmed) {
      throw new ConflictException(
        'The upload was already confirmed or changed',
        'UPLOAD_CONFIRMATION_CONFLICT',
      );
    }
    return this.toResponse(confirmed);
  }

  async attachAvatar(ownerId: string, assetId: string): Promise<void> {
    const result = await this.assetModel
      .updateOne(
        {
          _id: assetId,
          ownerId: new Types.ObjectId(ownerId),
          assetType: AssetType.AVATAR,
          status: AssetStatus.CONFIRMED,
        },
        {
          $set: {
            status: AssetStatus.ATTACHED,
            attachedResourceType: 'USER',
            attachedResourceId: new Types.ObjectId(ownerId),
          },
        },
      )
      .exec();
    if (result.modifiedCount !== 1) {
      throw new ConflictException(
        'The avatar asset could not be attached',
        'UPLOAD_ATTACHMENT_CONFLICT',
      );
    }
  }

  async get(
    ownerId: string,
    assetId: string,
  ): Promise<Record<string, unknown>> {
    const asset = await this.assetModel
      .findOne({
        _id: assetId,
        ownerId: new Types.ObjectId(ownerId),
        status: { $ne: AssetStatus.DELETED },
      })
      .exec();
    if (!asset) throw this.notFound();
    return this.toResponse(asset);
  }

  async delete(ownerId: string, assetId: string): Promise<void> {
    this.assertConfigured();
    const asset = await this.assetModel
      .findOneAndUpdate(
        {
          _id: assetId,
          ownerId: new Types.ObjectId(ownerId),
          status: {
            $in: [AssetStatus.PENDING, AssetStatus.CONFIRMED],
          },
          attachedResourceId: { $exists: false },
        },
        { $set: { status: AssetStatus.DELETION_PENDING } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!asset) throw this.notFound();
    const fallbackStatus = asset.signatureVerifiedAt
      ? AssetStatus.CONFIRMED
      : AssetStatus.PENDING;

    try {
      await this.cloudinary.deleteAsset(asset.publicId, asset.resourceType);
      await this.assetModel
        .updateOne(
          { _id: asset._id },
          {
            $set: { status: AssetStatus.DELETED, deletedAt: new Date() },
            $unset: { secureUrl: 1 },
          },
        )
        .exec();
    } catch (error) {
      await this.assetModel
        .updateOne(
          { _id: asset._id, status: AssetStatus.DELETION_PENDING },
          { $set: { status: fallbackStatus } },
        )
        .exec();
      throw error;
    }
  }

  async cleanupExpiredPending(): Promise<number> {
    if (!this.cloudinary.configured) return 0;
    const expired = await this.assetModel
      .find({
        status: AssetStatus.PENDING,
        deleteAfter: { $lte: new Date() },
      })
      .limit(100)
      .exec();
    let deleted = 0;
    for (const asset of expired) {
      try {
        await this.cloudinary.deleteAsset(asset.publicId, asset.resourceType);
        const result = await this.assetModel
          .updateOne(
            { _id: asset._id, status: AssetStatus.PENDING },
            {
              $set: { status: AssetStatus.DELETED, deletedAt: new Date() },
              $unset: { secureUrl: 1 },
            },
          )
          .exec();
        deleted += result.modifiedCount;
      } catch {
        await this.assetModel
          .updateOne(
            { _id: asset._id },
            {
              $set: {
                deleteAfter: new Date(Date.now() + 60 * 60 * 1000),
                'metadata.cleanupFailureCode': 'CLOUDINARY_DELETE_FAILED',
              },
            },
          )
          .exec();
      }
    }
    return deleted;
  }

  private async findOwnedPending(
    ownerId: string,
    assetId: string,
  ): Promise<MediaAssetDocument> {
    const asset = await this.assetModel
      .findOne({
        _id: assetId,
        ownerId: new Types.ObjectId(ownerId),
        status: AssetStatus.PENDING,
        deleteAfter: { $gt: new Date() },
      })
      .exec();
    if (!asset) throw this.notFound();
    return asset;
  }

  private validateProviderAsset(
    asset: MediaAssetDocument,
    providerAsset: CloudinaryAsset,
    ownerId: string,
    version: number,
  ): void {
    const policy = getUploadPolicy(
      asset.assetType,
      this.config.maxImageBytes,
      this.config.maxAudioBytes,
    );
    const format = providerAsset.format?.toLowerCase();
    if (
      providerAsset.publicId !== asset.publicId ||
      providerAsset.resourceType !== policy.resourceType ||
      providerAsset.ownerId !== ownerId ||
      providerAsset.assetId !== asset.id ||
      providerAsset.version !== version ||
      !format ||
      !policy.allowedFormats.includes(format) ||
      providerAsset.bytes <= 0 ||
      providerAsset.bytes > policy.maxBytes
    ) {
      throw new ConflictException(
        'The provider asset does not match the signed upload policy',
        'UPLOAD_POLICY_MISMATCH',
      );
    }
  }

  private mimeType(asset: CloudinaryAsset, assetType: AssetType): string {
    const format = asset.format?.toLowerCase() ?? 'octet-stream';
    return assetType === AssetType.VERIFICATION_AUDIO
      ? `audio/${format}`
      : `image/${format === 'jpg' ? 'jpeg' : format}`;
  }

  private toResponse(asset: MediaAssetDocument): Record<string, unknown> {
    return {
      id: asset.id,
      assetType: asset.assetType,
      provider: asset.provider,
      resourceType: asset.resourceType,
      format: asset.format,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      secureUrl: asset.secureUrl,
      status: asset.status,
      signatureVerifiedAt: asset.signatureVerifiedAt,
      attachedResourceType: asset.attachedResourceType,
      attachedResourceId: asset.attachedResourceId,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private assertConfigured(): void {
    if (!this.cloudinary.configured) {
      throw new ExternalProviderException(
        'Cloudinary is not configured',
        'CLOUDINARY_NOT_CONFIGURED',
      );
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      'The media asset could not be found',
      'MEDIA_ASSET_NOT_FOUND',
    );
  }
}
