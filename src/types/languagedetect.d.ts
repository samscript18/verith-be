declare module 'languagedetect' {
  export default class LanguageDetect {
    detect(text: string, limit?: number): Array<[string, number]>;
  }
}
