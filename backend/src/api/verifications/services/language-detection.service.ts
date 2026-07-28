import { Injectable } from '@nestjs/common';
import LanguageDetect from 'languagedetect';

const LANGUAGE_CODES: Record<string, string> = {
  english: 'en',
  french: 'fr',
  spanish: 'es',
  german: 'de',
  portuguese: 'pt',
  italian: 'it',
  dutch: 'nl',
  russian: 'ru',
  arabic: 'ar',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  hindi: 'hi',
  swahili: 'sw',
  turkish: 'tr',
  polish: 'pl',
  ukrainian: 'uk',
};

@Injectable()
export class LanguageDetectionService {
  private readonly detector = new LanguageDetect();

  detect(text: string): { language: string; confidence: number } {
    const [result] = this.detector.detect(text.slice(0, 20000), 1);
    if (!result) return { language: 'und', confidence: 0 };
    const [name, confidence] = result;
    return {
      language: LANGUAGE_CODES[name.toLowerCase()] ?? name.toLowerCase(),
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }
}
