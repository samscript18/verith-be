import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { PrivacyConfig } from '../../../shared/config';

@Injectable()
export class PrivacyCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const value =
      config.getOrThrow<PrivacyConfig>('privacy').exportEncryptionKey;
    this.key = createHash('sha256').update(value).digest();
  }

  token(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  matches(raw: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(raw));
    const expected = Buffer.from(expectedHash);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  encrypt(value: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64',
    );
  }

  decrypt(value: string): Buffer {
    const payload = Buffer.from(value, 'base64');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]);
  }

  hash(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
