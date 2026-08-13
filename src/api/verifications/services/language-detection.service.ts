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

const COMMON_WORDS: Record<'en' | 'fr' | 'es', ReadonlySet<string>> = {
  en: new Set([
    'a',
    'all',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'before',
    'by',
    'for',
    'from',
    'has',
    'have',
    'in',
    'is',
    'it',
    'new',
    'not',
    'of',
    'on',
    'that',
    'the',
    'this',
    'to',
    'today',
    'was',
    'were',
    'will',
    'with',
  ]),
  fr: new Set([
    'a',
    'au',
    'aux',
    'avec',
    'avant',
    'ce',
    'cette',
    'dans',
    'de',
    'des',
    'du',
    'en',
    'est',
    'et',
    'la',
    'le',
    'les',
    'ne',
    'nouvelle',
    'pas',
    'par',
    'pour',
    'que',
    'qui',
    'sur',
    'un',
    'une',
  ]),
  es: new Set([
    'antes',
    'con',
    'de',
    'del',
    'el',
    'en',
    'es',
    'esta',
    'la',
    'las',
    'los',
    'no',
    'nueva',
    'para',
    'por',
    'que',
    'se',
    'un',
    'una',
    'y',
  ]),
};

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  supported: boolean;
}

export interface LanguageComplianceResult extends LanguageDetectionResult {
  expectedLanguage: string;
  expectedLexicalConfidence: number;
  detectedLexicalConfidence: number;
  matches: boolean;
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
    const rawConfidence = Math.max(0, Math.min(1, confidence));
    return {
      language,
      confidence: Math.max(
        rawConfidence,
        this.lexicalConfidence(language, text),
      ),
      supported: isSupportedLanguage(language),
    };
  }

  /**
   * Validate the dominant explanatory language without treating a low-score
   * neighbouring Latin language classification as authoritative. This keeps
   * genuine English output from passing as French or Spanish, while allowing
   * long French/Spanish reports that the statistical detector narrowly labels
   * as Italian, Portuguese or Latin.
   */
  assessExpectedLanguage(
    text: string,
    expectedLanguage: string,
  ): LanguageComplianceResult {
    const detected = this.detect(text);
    const expectedLexicalConfidence = this.confidenceFor(
      expectedLanguage,
      text,
    );
    const detectedLexicalConfidence = this.confidenceFor(
      detected.language,
      text,
    );
    const lexicalMatch =
      expectedLexicalConfidence >= 0.7 &&
      expectedLexicalConfidence >= detectedLexicalConfidence + 0.05;

    return {
      ...detected,
      expectedLanguage,
      expectedLexicalConfidence,
      detectedLexicalConfidence,
      matches: detected.language === expectedLanguage || lexicalMatch,
    };
  }

  private confidenceFor(language: string, text: string): number {
    if (language === 'yo') return this.yorubaConfidence(text);
    return this.lexicalConfidence(language, text);
  }

  private lexicalConfidence(language: string, text: string): number {
    if (!['en', 'fr', 'es'].includes(language)) return 0;
    const words =
      text
        .slice(0, 20000)
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .match(/[a-z]+/g) ?? [];
    if (words.length < 4) return 0;
    const vocabulary = COMMON_WORDS[language as 'en' | 'fr' | 'es'];
    const matchingWords = words.filter((word) => vocabulary.has(word));
    const uniqueMatches = new Set(matchingWords).size;
    if (matchingWords.length < 2 || uniqueMatches < 2) return 0;
    const density = matchingWords.length / Math.min(words.length, 40);
    return Math.min(
      0.94,
      0.56 + Math.min(0.24, uniqueMatches * 0.04) + density * 0.22,
    );
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
