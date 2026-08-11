import { Injectable } from '@nestjs/common';

@Injectable()
export class TextNormalizationService {
  normalize(value: string): string {
    return value
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
        '',
      )
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  normalizeClaim(value: string): string {
    return this.normalize(value)
      .replace(/\s+/g, ' ')
      .replace(/[.!?]+$/g, '')
      .toLocaleLowerCase('und');
  }
}
