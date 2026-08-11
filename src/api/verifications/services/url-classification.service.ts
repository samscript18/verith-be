import { Injectable } from '@nestjs/common';
import { UrlSourceKind } from '../enums/url-source-kind.enum';

export interface ClassifiedUrl {
  normalizedUrl: string;
  kind: UrlSourceKind;
  socialPostId?: string;
}

const SOCIAL_HOSTS = new Set([
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'threads.net',
  'youtube.com',
  'youtu.be',
]);

const DOCUMENT_EXTENSIONS = /\.(?:docx?|odt|pdf|pptx?|rtf|xlsx?)(?:$|\/)/i;
const MEDIA_EXTENSIONS =
  /\.(?:aac|avi|flac|m4a|mkv|mov|mp3|mp4|ogg|wav|webm)(?:$|\/)/i;
const ARTICLE_PATH = /\/(?:article|articles|news|story|stories)\//i;

@Injectable()
export class UrlClassificationService {
  classify(rawUrl: string): ClassifiedUrl {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    if (hostname === 'x.com' || hostname === 'twitter.com') {
      const match = url.pathname.match(
        /^\/(?:([a-z0-9_]{1,15})\/status|i\/web\/status)\/(\d+)(?:\/.*)?$/i,
      );
      if (match) {
        const username = match[1];
        const postId = match[2]!;
        url.protocol = 'https:';
        url.hostname = 'x.com';
        url.port = '';
        url.pathname = username
          ? `/${username}/status/${postId}`
          : `/i/web/status/${postId}`;
        url.search = '';
        url.hash = '';
        return {
          normalizedUrl: url.toString(),
          kind: UrlSourceKind.SOCIAL_X,
          socialPostId: postId,
        };
      }
      return {
        normalizedUrl: url.toString(),
        kind: UrlSourceKind.SOCIAL_OTHER,
      };
    }

    if (SOCIAL_HOSTS.has(hostname)) {
      return {
        normalizedUrl: url.toString(),
        kind: UrlSourceKind.SOCIAL_OTHER,
      };
    }
    if (DOCUMENT_EXTENSIONS.test(url.pathname)) {
      return {
        normalizedUrl: url.toString(),
        kind: UrlSourceKind.DOCUMENT,
      };
    }
    if (MEDIA_EXTENSIONS.test(url.pathname)) {
      return {
        normalizedUrl: url.toString(),
        kind: UrlSourceKind.MEDIA_PAGE,
      };
    }
    return {
      normalizedUrl: url.toString(),
      kind: ARTICLE_PATH.test(url.pathname)
        ? UrlSourceKind.NEWS_ARTICLE
        : UrlSourceKind.STANDARD_WEBPAGE,
    };
  }
}
