import { LanguageDetectionService } from './language-detection.service';

describe('LanguageDetectionService', () => {
  const service = new LanguageDetectionService();

  it.each([
    ['English', 'The agency announced a new verification policy today.', 'en'],
    ['French', 'Le gouvernement a annoncé une nouvelle règle vendredi.', 'fr'],
    ['Spanish', 'El gobierno anunció una nueva regla antes del viernes.', 'es'],
    [
      'Yorùbá with diacritics',
      'Àwọn ènìyàn náà sọ pé ìjọba yóò kéde òfin tuntun ní ọ̀la.',
      'yo',
    ],
    [
      'Yorùbá without diacritics',
      'Awon eniyan naa so pe ijoba yoo kede ofin tuntun nitori eyi ni won fe.',
      'yo',
    ],
  ])('detects %s', (_label, text, expected) => {
    expect(service.detect(text).language).toBe(expected);
  });

  it('marks languages outside the product matrix as experimental', () => {
    const result = service.detect(
      'Die Regierung kündigte heute eine neue Regelung für Schulen an.',
    );
    expect(result.supported).toBe(false);
  });

  it.each([
    [
      'en',
      'The agency announced a new verification policy that will apply today.',
    ],
    ['fr', 'Le gouvernement a annoncé une nouvelle règle pour les écoles.'],
    ['es', 'El gobierno anunció una nueva regla para todas las escuelas.'],
  ])(
    'calibrates a clear %s sample above the confirmation threshold',
    (expected, text) => {
      const result = service.detect(text);
      expect(result.language).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    },
  );

  it('accepts a clearly French report even when nearby Latin-language terms are present', () => {
    const result = service.assessExpectedLanguage(
      'Cette affirmation peut être trompeuse. BBC, OpenAI et Verith sont mentionnés. Les preuves restent limitées et la conclusion doit demeurer provisoire jusqu’à ce que des sources primaires indépendantes plus solides soient examinées. Consultez les documents officiels avant de partager cette publication.',
      'fr',
    );

    expect(result.matches).toBe(true);
    expect(result.expectedLexicalConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it('does not accept dominant English output as French', () => {
    const result = service.assessExpectedLanguage(
      'The available evidence does not fully support this claim. Review the official source and verify the publication date before sharing it with other people.',
      'fr',
    );

    expect(result.matches).toBe(false);
    expect(result.language).toBe('en');
  });
});
