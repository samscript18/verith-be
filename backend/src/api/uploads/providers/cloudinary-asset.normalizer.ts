import { ExternalProviderException } from '../../../core/exceptions';
import type { CloudinaryAsset } from '../interfaces/cloudinary-provider.interface';

export function normalizeCloudinaryAsset(value: unknown): CloudinaryAsset {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('public_id' in value) ||
    typeof value.public_id !== 'string' ||
    !('type' in value) ||
    typeof value.type !== 'string' ||
    !('resource_type' in value) ||
    typeof value.resource_type !== 'string' ||
    !('bytes' in value) ||
    !('secure_url' in value) ||
    typeof value.secure_url !== 'string' ||
    !('version' in value)
  ) {
    throw invalidResponse();
  }
  const bytes = Number(value.bytes);
  const version = Number(value.version);
  if (!Number.isFinite(bytes) || !Number.isFinite(version)) {
    throw invalidResponse();
  }
  const context = readContext(value);
  return {
    ...('asset_id' in value && typeof value.asset_id === 'string'
      ? { providerAssetId: value.asset_id }
      : {}),
    publicId: value.public_id,
    resourceType: value.resource_type,
    deliveryType: value.type,
    bytes,
    secureUrl: value.secure_url,
    version,
    ...('format' in value && typeof value.format === 'string'
      ? { format: value.format }
      : {}),
    ...numberProperty(value, 'width'),
    ...numberProperty(value, 'height'),
    ...durationProperty(value),
    ...(context.ownerId ? { ownerId: context.ownerId } : {}),
    ...(context.assetId ? { assetId: context.assetId } : {}),
  };
}

function durationProperty(value: object): Partial<Record<'duration', number>> {
  const record = value as Record<string, unknown>;
  const nestedRecords = [record.media_metadata, record.video].filter(
    (candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' && candidate !== null,
  );
  const candidates = [
    record.duration,
    record.video_duration,
    record.format_duration,
    ...nestedRecords.flatMap((candidate) => [
      candidate.duration,
      candidate.video_duration,
      candidate.format_duration,
    ]),
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const duration = Number(candidate);
    if (Number.isFinite(duration) && duration > 0) return { duration };
  }
  return {};
}

function numberProperty(
  value: object,
  key: 'width' | 'height' | 'duration',
): Partial<Record<'width' | 'height' | 'duration', number>> {
  const record = value as Record<string, unknown>;
  if (!(key in record) || record[key] === null || record[key] === undefined) {
    return {};
  }
  const number = Number(record[key]);
  return Number.isFinite(number) ? { [key]: number } : {};
}

function readContext(value: object): {
  ownerId?: string;
  assetId?: string;
} {
  if (
    !('context' in value) ||
    typeof value.context !== 'object' ||
    !value.context
  ) {
    return {};
  }
  const context = value.context;
  const custom =
    'custom' in context && typeof context.custom === 'object' && context.custom
      ? context.custom
      : context;
  return {
    ...('owner_id' in custom ? { ownerId: String(custom.owner_id) } : {}),
    ...('asset_id' in custom ? { assetId: String(custom.asset_id) } : {}),
  };
}

function invalidResponse(): ExternalProviderException {
  return new ExternalProviderException(
    'Cloudinary returned an invalid asset response',
    'CLOUDINARY_INVALID_RESPONSE',
  );
}
