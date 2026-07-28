import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { timingSafeEqual } from 'node:crypto';
import type { CloudinaryConfig } from '../../../shared/config';
import { ExternalProviderException } from '../../../core/exceptions';
import type {
  CloudinaryAsset,
  CloudinaryProvider,
} from '../interfaces/cloudinary-provider.interface';

@Injectable()
export class CloudinaryProviderAdapter implements CloudinaryProvider {
  readonly configured: boolean;
  readonly cloudName: string;
  readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<CloudinaryConfig>('cloudinary');
    this.configured = config.configured;
    this.cloudName = config.cloudName;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    if (this.configured) {
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
      });
    }
  }

  sign(parameters: Record<string, string | number | boolean>): string {
    this.assertConfigured();
    return cloudinary.utils.api_sign_request(parameters, this.apiSecret);
  }

  verifyUploadSignature(
    publicId: string,
    version: number,
    signature: string,
  ): boolean {
    const expected = this.sign({ public_id: publicId, version });
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(signature);
    return (
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer)
    );
  }

  async getAsset(
    publicId: string,
    resourceType: string,
  ): Promise<CloudinaryAsset> {
    this.assertConfigured();
    try {
      const result = (await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        context: true,
      })) as unknown;
      return this.normalizeAsset(result);
    } catch {
      throw new ExternalProviderException(
        'Cloudinary could not verify the uploaded asset',
        'CLOUDINARY_ASSET_UNAVAILABLE',
      );
    }
  }

  async deleteAsset(publicId: string, resourceType: string): Promise<void> {
    this.assertConfigured();
    try {
      const result = (await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      })) as unknown;
      if (!this.isSuccessfulDeletion(result)) {
        throw new Error('Cloudinary deletion was not acknowledged');
      }
    } catch {
      throw new ExternalProviderException(
        'Cloudinary could not delete the asset',
        'CLOUDINARY_DELETE_FAILED',
      );
    }
  }

  private normalizeAsset(value: unknown): CloudinaryAsset {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('public_id' in value) ||
      !('resource_type' in value) ||
      !('bytes' in value) ||
      !('secure_url' in value) ||
      !('version' in value)
    ) {
      throw new ExternalProviderException(
        'Cloudinary returned an invalid asset response',
        'CLOUDINARY_INVALID_RESPONSE',
      );
    }
    const context = this.readContext(value);
    return {
      publicId: String(value.public_id),
      resourceType: String(value.resource_type),
      bytes: Number(value.bytes),
      secureUrl: String(value.secure_url),
      version: Number(value.version),
      ...('format' in value && typeof value.format === 'string'
        ? { format: value.format }
        : {}),
      ...('width' in value && value.width
        ? { width: Number(value.width) }
        : {}),
      ...('height' in value && value.height
        ? { height: Number(value.height) }
        : {}),
      ...('duration' in value && value.duration
        ? { duration: Number(value.duration) }
        : {}),
      ...(context.ownerId ? { ownerId: context.ownerId } : {}),
      ...(context.assetId ? { assetId: context.assetId } : {}),
    };
  }

  private readContext(value: object): { ownerId?: string; assetId?: string } {
    if (
      !('context' in value) ||
      typeof value.context !== 'object' ||
      !value.context
    ) {
      return {};
    }
    const context = value.context;
    const custom =
      'custom' in context &&
      typeof context.custom === 'object' &&
      context.custom
        ? context.custom
        : context;
    return {
      ...('owner_id' in custom ? { ownerId: String(custom.owner_id) } : {}),
      ...('asset_id' in custom ? { assetId: String(custom.asset_id) } : {}),
    };
  }

  private isSuccessfulDeletion(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      'result' in value &&
      (value.result === 'ok' || value.result === 'not found')
    );
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ExternalProviderException(
        'Cloudinary is not configured',
        'CLOUDINARY_NOT_CONFIGURED',
      );
    }
  }
}
