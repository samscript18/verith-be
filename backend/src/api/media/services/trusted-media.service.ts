import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationException } from '../../../core/exceptions';
import type { CloudinaryConfig } from '../../../shared/config';

@Injectable()
export class TrustedMediaService {
  private readonly config: CloudinaryConfig;
  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<CloudinaryConfig>('cloudinary');
  }

  assertTrustedUrl(value: string): URL {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      !url.pathname.startsWith(`/${this.config.cloudName}/`)
    )
      throw new ApplicationException(
        'The stored media URL is not trusted',
        422,
        'MEDIA_URL_UNTRUSTED',
      );
    return url;
  }

  async imageBytes(
    value: string,
  ): Promise<{ mimeType: string; base64Data: string }> {
    const url = this.assertTrustedUrl(value);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new ApplicationException(
        'The media asset could not be retrieved',
        503,
        'MEDIA_RETRIEVAL_FAILED',
      );
    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!mimeType.startsWith('image/'))
      throw new ApplicationException(
        'The media asset is not a supported image',
        422,
        'MEDIA_CONTENT_TYPE_UNSUPPORTED',
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > this.config.maxImageBytes || bytes.length > 15_000_000)
      throw new ApplicationException(
        'The image exceeds the inline analysis limit',
        422,
        'MEDIA_TOO_LARGE',
      );
    return { mimeType, base64Data: bytes.toString('base64') };
  }

  async videoBytes(
    value: string,
  ): Promise<{ mimeType: string; base64Data: string }> {
    const url = this.assertTrustedUrl(value);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new ApplicationException(
        'The video asset could not be retrieved',
        503,
        'MEDIA_RETRIEVAL_FAILED',
      );
    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!['video/mp4', 'video/webm'].includes(mimeType))
      throw new ApplicationException(
        'The media asset is not a supported video',
        422,
        'MEDIA_CONTENT_TYPE_UNSUPPORTED',
      );
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > this.config.maxVideoBytes)
      throw new ApplicationException(
        'The video exceeds the inline analysis limit',
        422,
        'MEDIA_TOO_LARGE',
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > this.config.maxVideoBytes)
      throw new ApplicationException(
        'The video exceeds the inline analysis limit',
        422,
        'MEDIA_TOO_LARGE',
      );
    return { mimeType, base64Data: bytes.toString('base64') };
  }
}
