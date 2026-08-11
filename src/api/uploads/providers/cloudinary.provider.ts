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
import { normalizeCloudinaryAsset } from './cloudinary-asset.normalizer';

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
        ...(resourceType === 'video' ? { media_metadata: true } : {}),
      })) as unknown;
      return normalizeCloudinaryAsset(result);
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
