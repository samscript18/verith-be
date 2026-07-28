import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch, type Response } from 'undici';
import {
  ExternalProviderException,
  ValidationException,
} from '../../core/exceptions';
import type { ProcessingConfig } from '../config';

export interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  redirects: number;
}

@Injectable()
export class SafeFetchService {
  private readonly config: ProcessingConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<ProcessingConfig>('processing');
  }

  async fetchHtml(rawUrl: string): Promise<SafeFetchResult> {
    let current = this.parseAndValidate(rawUrl);
    const requestedUrl = current.toString();
    for (
      let redirects = 0;
      redirects <= this.config.urlMaxRedirects;
      redirects += 1
    ) {
      const resolved = await this.resolvePublic(current.hostname);
      const agent = this.pinnedAgent(resolved.address, resolved.family);
      try {
        const response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          dispatcher: agent,
          signal: AbortSignal.timeout(this.config.urlTimeoutMs),
          headers: {
            accept: 'text/html,application/xhtml+xml;q=0.9',
            'user-agent': this.config.userAgent,
          },
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) throw this.failure('URL_REDIRECT_INVALID');
          if (redirects === this.config.urlMaxRedirects) {
            throw this.failure('URL_REDIRECT_LIMIT_EXCEEDED');
          }
          current = this.parseAndValidate(
            new URL(location, current).toString(),
          );
          continue;
        }
        if (response.status === 404) throw this.failure('URL_NOT_FOUND');
        if (response.status === 401 || response.status === 403) {
          throw this.failure('URL_ACCESS_BLOCKED');
        }
        if (!response.ok) throw this.failure('URL_FETCH_FAILED');
        const contentType = response.headers
          .get('content-type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase();
        if (
          contentType !== 'text/html' &&
          contentType !== 'application/xhtml+xml'
        ) {
          throw this.failure('URL_CONTENT_TYPE_UNSUPPORTED');
        }
        const declaredLength = Number(
          response.headers.get('content-length') ?? 0,
        );
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > this.config.urlMaxBytes
        ) {
          throw this.failure('URL_RESPONSE_TOO_LARGE');
        }
        const body = await this.readBounded(response);
        return {
          requestedUrl,
          finalUrl: current.toString(),
          status: response.status,
          contentType,
          body,
          redirects,
        };
      } catch (error) {
        if (
          error instanceof ExternalProviderException ||
          error instanceof ValidationException
        ) {
          throw error;
        }
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw this.failure('URL_FETCH_TIMEOUT');
        }
        throw this.failure('URL_FETCH_UNAVAILABLE');
      } finally {
        await agent.close();
      }
    }
    throw this.failure('URL_REDIRECT_LIMIT_EXCEEDED');
  }

  parseAndValidate(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new ValidationException('The submitted URL is invalid');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new ValidationException('The URL protocol is not allowed');
    }
    if (url.username || url.password) {
      throw new ValidationException(
        'URLs containing credentials are not allowed',
      );
    }
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '');
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      throw new ValidationException('The URL host is not allowed');
    }
    if (
      url.port &&
      !(
        (url.protocol === 'http:' && url.port === '80') ||
        (url.protocol === 'https:' && url.port === '443')
      )
    ) {
      throw new ValidationException('The URL port is not allowed');
    }
    if (isIP(hostname)) this.assertPublicAddress(hostname);
    if (!hostname.includes(':')) url.hostname = hostname;
    url.hash = '';
    return url;
  }

  assertPublicAddress(address: string): void {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      this.assertPublicAddress(normalized.slice(7));
      return;
    }
    const family = isIP(normalized);
    if (family === 4) {
      const octets = normalized.split('.').map(Number);
      const first = octets[0] ?? 0;
      const second = octets[1] ?? 0;
      const blocked =
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 0) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        first >= 224;
      if (blocked) {
        throw new ValidationException(
          'The URL resolves to a prohibited network',
        );
      }
      return;
    }
    if (family === 6) {
      if (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
      ) {
        throw new ValidationException(
          'The URL resolves to a prohibited network',
        );
      }
      return;
    }
    throw new ValidationException('The URL host could not be validated');
  }

  private async resolvePublic(
    hostname: string,
  ): Promise<{ address: string; family: 4 | 6 }> {
    hostname = hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) {
      this.assertPublicAddress(hostname);
      return { address: hostname, family: isIP(hostname) as 4 | 6 };
    }
    let addresses;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw this.failure('URL_DNS_LOOKUP_FAILED');
    }
    if (!addresses.length) throw this.failure('URL_DNS_LOOKUP_FAILED');
    for (const result of addresses) this.assertPublicAddress(result.address);
    const selected = addresses[0]!;
    if (selected.family !== 4 && selected.family !== 6) {
      throw this.failure('URL_DNS_LOOKUP_FAILED');
    }
    return { address: selected.address, family: selected.family };
  }

  private pinnedAgent(address: string, family: 4 | 6): Agent {
    return new Agent({
      connect: {
        lookup: (_hostname, _options, callback) =>
          callback(null, address, family),
      },
    });
  }

  private async readBounded(response: Response): Promise<string> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response.body ?? []) {
      const bytes = Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > this.config.urlMaxBytes) {
        throw this.failure('URL_RESPONSE_TOO_LARGE');
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private failure(code: string): ExternalProviderException {
    return new ExternalProviderException(
      'The submitted URL could not be retrieved safely',
      code,
    );
  }
}
