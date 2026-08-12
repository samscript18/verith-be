export enum SupportedLanguage {
  ENGLISH = 'en',
  FRENCH = 'fr',
  SPANISH = 'es',
  YORUBA = 'yo',
}

export const SUPPORTED_LANGUAGES = Object.freeze(
  Object.values(SupportedLanguage),
);

export const SUPPORTED_LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  [SupportedLanguage.ENGLISH]: 'English',
  [SupportedLanguage.FRENCH]: 'Français',
  [SupportedLanguage.SPANISH]: 'Español',
  [SupportedLanguage.YORUBA]: 'Yorùbá',
};

export const isSupportedLanguage = (
  value: unknown,
): value is SupportedLanguage =>
  typeof value === 'string' &&
  SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);

export const supportedLanguageOrEnglish = (
  value: unknown,
): SupportedLanguage =>
  isSupportedLanguage(value) ? value : SupportedLanguage.ENGLISH;
