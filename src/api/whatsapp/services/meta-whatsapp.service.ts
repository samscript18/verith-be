import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ExternalProviderException } from '../../../core/exceptions';
import type { WhatsAppConfig } from '../../../shared/config';

@Injectable()
export class MetaWhatsAppService {
  readonly config: WhatsAppConfig;
  constructor(config: ConfigService) {
    this.config = config.getOrThrow<WhatsAppConfig>('whatsapp');
  }

  verifyWebhookToken(mode?: string, token?: string): boolean {
    return (
      this.config.enabled &&
      mode === 'subscribe' &&
      Boolean(token) &&
      this.safeEqual(token ?? '', this.config.verifyToken)
    );
  }

  verifySignature(rawBody: Buffer, signature?: string): boolean {
    if (!this.config.enabled || !signature?.startsWith('sha256=')) return false;
    const expected = `sha256=${createHmac('sha256', this.config.appSecret)
      .update(rawBody)
      .digest('hex')}`;
    return this.safeEqual(signature, expected);
  }

  async sendText(to: string, text: string): Promise<string> {
    this.assertConfigured();
    const response = await this.request(
      `${this.config.baseUrl}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: true, body: text },
        }),
      },
    );
    if (!this.isObject(response) || !Array.isArray(response.messages))
      throw new ExternalProviderException(
        'Meta returned an invalid message response',
        'WHATSAPP_INVALID_RESPONSE',
      );
    const first: unknown = response.messages[0];
    if (!this.isObject(first) || typeof first.id !== 'string')
      throw new ExternalProviderException(
        'Meta did not return a message identifier',
        'WHATSAPP_INVALID_RESPONSE',
      );
    return first.id;
  }

  async getMedia(mediaId: string): Promise<{
    bytes: Buffer;
    mimeType: string;
  }> {
    this.assertConfigured();
    const metadata = await this.request(
      `${this.config.baseUrl}/${this.config.apiVersion}/${mediaId}`,
      { method: 'GET' },
    );
    if (
      !this.isObject(metadata) ||
      typeof metadata.url !== 'string' ||
      typeof metadata.mime_type !== 'string'
    )
      throw new ExternalProviderException(
        'Meta returned invalid media metadata',
        'WHATSAPP_MEDIA_INVALID_RESPONSE',
      );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(metadata.url, {
        headers: { authorization: `Bearer ${this.config.accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new ExternalProviderException(
          'Meta media download failed',
          'WHATSAPP_MEDIA_UNAVAILABLE',
        );
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, mimeType: metadata.mime_type };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          ...init.headers,
        },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new ExternalProviderException(
          'The Meta WhatsApp API request failed',
          response.status === 429
            ? 'WHATSAPP_RATE_LIMITED'
            : 'WHATSAPP_PROVIDER_UNAVAILABLE',
        );
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ExternalProviderException) throw error;
      throw new ExternalProviderException(
        'The Meta WhatsApp API request failed',
        'WHATSAPP_PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertConfigured() {
    if (!this.config.enabled)
      throw new ExternalProviderException(
        'WhatsApp is not configured',
        'WHATSAPP_NOT_CONFIGURED',
      );
  }
  private safeEqual(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
