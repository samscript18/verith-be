export interface CloudinaryAsset {
  providerAssetId?: string;
  publicId: string;
  resourceType: string;
  deliveryType: string;
  format?: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  secureUrl: string;
  version: number;
  ownerId?: string;
  assetId?: string;
}

export interface CloudinaryProvider {
  readonly configured: boolean;
  readonly cloudName: string;
  readonly apiKey: string;
  sign(parameters: Record<string, string | number | boolean>): string;
  verifyUploadSignature(
    publicId: string,
    version: number,
    signature: string,
  ): boolean;
  getAsset(publicId: string, resourceType: string): Promise<CloudinaryAsset>;
  deleteAsset(publicId: string, resourceType: string): Promise<void>;
}

export const CLOUDINARY_PROVIDER = Symbol('CLOUDINARY_PROVIDER');
