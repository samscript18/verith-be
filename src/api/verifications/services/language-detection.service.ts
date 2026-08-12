import { Injectable } from '@nestjs/common';
import LanguageDetect from 'languagedetect';
import { isSupportedLanguage } from '../../../shared/language/supported-language';

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
  yoruba: 'yo',
};

const YORUBA_COMMON_WORDS = new Set([
  'ati',
  'awon',
  'bayi',
  'beeni',
  'bawo',
  'boya',
  'eyi',
  'fun',
  'gbogbo',
  'igba',
  'je',
  'kan',
  'ki',
  'ko',
  'lati',
  'le',
  'lo',
  'naa',
  'nigbati',
  'nitori',
  'ninu',
  'ni',
  'nkan',
  'nwon',
  'ohun',
  'pelu',
  'pe',
  'sibe',
  'sugbon',
  'tabi',
  'ti',
  'wa',
  'won',
  'yii',
]);

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  supported: boolean;
}

@Injectable()
export class LanguageDetectionService {
  private readonly detector = new LanguageDetect();

  detect(text: string): LanguageDetectionResult {
    const yoruba = this.yorubaConfidence(text);
    if (yoruba >= 0.64) {
      return { language: 'yo', confidence: yoruba, supported: true };
    }
    const [result] = this.detector.detect(text.slice(0, 20000), 1);
    if (!result) return { language: 'und', confidence: 0, supported: false };
    const [name, confidence] = result;
    const language = LANGUAGE_CODES[name.toLowerCase()] ?? name.toLowerCase();
    return {
      language,
      confidence: Math.max(0, Math.min(1, confidence)),
      supported: isSupportedLanguage(language),
    };
  }

  private yorubaConfidence(text: string): number {
    const sample = text.slice(0, 20000).toLocaleLowerCase();
    const words = sample.match(/[\p{L}\p{M}]+/gu) ?? [];
    if (words.length < 3) return 0;
    const explicitLetters = sample.match(/[ẹọṣ]/gu)?.length ?? 0;
    const normalizedWords = words.map((word) =>
      word.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    const commonMatches = normalizedWords.filter((word) =>
      YORUBA_COMMON_WORDS.has(word),
    ).length;
    const density = commonMatches / Math.min(normalizedWords.length, 40);
    const explicitSignal = Math.min(0.5, explicitLetters * 0.12);
    const vocabularySignal = Math.min(0.7, density * 2.4);
    const breadthSignal = commonMatches >= 4 ? 0.12 : 0;
    return Math.min(0.99, explicitSignal + vocabularySignal + breadthSignal);
  }
}
