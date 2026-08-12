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
});
