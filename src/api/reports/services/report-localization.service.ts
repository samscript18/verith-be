import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Joi from 'joi';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ApplicationException,
  ExternalProviderException,
} from '../../../core/exceptions';
import { AiCapability } from '../../ai/enums/ai-capability.enum';
import { AiProviderName } from '../../ai/enums/ai-provider-name.enum';
import { AiRouterService } from '../../ai/services/ai-router.service';
import { LanguageDetectionService } from '../../verifications/services/language-detection.service';
import type { Report } from '../schemas/report.schema';
import {
  ReportLocalization,
  ReportLocalizationStatus,
} from '../schemas/report-localization.schema';
import {
  SUPPORTED_LANGUAGE_LABELS,
  SupportedLanguage,
} from '../../../shared/language/supported-language';

interface TranslationItem {
  path: string;
  text: string;
}

interface TranslationOutput {
  translations: TranslationItem[];
}

const outputValidator = Joi.object<TranslationOutput>({
  translations: Joi.array()
    .items(
      Joi.object({
        path: Joi.string()
          .pattern(/^\/(?:[A-Za-z0-9_-]+\/?)+$/)
          .required(),
        text: Joi.string().trim().min(1).max(12000).required(),
      }).required(),
    )
    .max(160)
    .required(),
}).required();

const outputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['translations'],
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'text'],
        properties: {
          path: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
};

@Injectable()
export class ReportLocalizationService {
  static readonly VERSION = 'report-localization.v2';
  private readonly logger = new Logger(ReportLocalizationService.name);

  constructor(
    @InjectModel(ReportLocalization.name)
    private readonly localizationModel: Model<ReportLocalization>,
    private readonly ai: AiRouterService,
    private readonly languages: LanguageDetectionService,
  ) {}

  async present(
    report: Report & { _id: Types.ObjectId },
    canonicalProjection: Record<string, unknown>,
    language: SupportedLanguage,
  ): Promise<Record<string, unknown>> {
    if (language === SupportedLanguage.ENGLISH) {
      return {
        ...canonicalProjection,
        presentationLanguage: SupportedLanguage.ENGLISH,
        localizationStatus: ReportLocalizationStatus.COMPLETE,
      };
    }
    const cached = await this.localizationModel
      .findOne({
        reportId: report._id,
        language,
        localizationVersion: ReportLocalizationService.VERSION,
      })
      .lean()
      .exec();
    return this.cachedProjection(canonicalProjection, language, cached);
  }

  async generate(
    report: Report & { _id: Types.ObjectId },
    canonicalProjection: Record<string, unknown>,
    language: SupportedLanguage,
    requestId: string,
    force = false,
  ): Promise<Record<string, unknown>> {
    if (language === SupportedLanguage.ENGLISH) {
      return this.present(
        report,
        canonicalProjection,
        SupportedLanguage.ENGLISH,
      );
    }
    const key = {
      reportId: report._id,
      language,
      localizationVersion: ReportLocalizationService.VERSION,
    };
    const existing = await this.localizationModel.findOne(key).lean().exec();
    if (existing?.status === ReportLocalizationStatus.COMPLETE) {
      return this.cachedProjection(canonicalProjection, language, existing);
    }
    if (
      !force &&
      existing?.status === ReportLocalizationStatus.FALLBACK &&
      (!existing.retryable ||
        (existing.retryAfter && existing.retryAfter > new Date()))
    ) {
      return this.cachedProjection(canonicalProjection, language, existing);
    }

    const now = new Date();
    try {
      await this.localizationModel.updateOne(
        key,
        {
          $setOnInsert: {
            status: ReportLocalizationStatus.FALLBACK,
            content: { translations: [] },
            limitations: [],
            generatedAt: now,
            retryable: true,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;
    }
    const leaseToken = randomUUID();
    const leased = await this.localizationModel
      .findOneAndUpdate(
        {
          ...key,
          $or: [
            { status: { $ne: ReportLocalizationStatus.PENDING } },
            { leaseExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            status: ReportLocalizationStatus.PENDING,
            leaseToken,
            leaseExpiresAt: new Date(now.getTime() + 3 * 60 * 1000),
            lastAttemptAt: now,
            retryable: true,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    if (!leased || leased.leaseToken !== leaseToken) {
      return this.present(report, canonicalProjection, language);
    }

    const source = this.translationItems(canonicalProjection);
    try {
      let generated = await this.translate(
        report,
        source,
        language,
        requestId,
        '',
        undefined,
        2,
      );
      let translations = this.validatePaths(
        source,
        generated.output.translations,
      );
      if (!this.languageMatches(translations, language, report, requestId)) {
        if (generated.fallbackUsed) {
          throw new Error('REPORT_LOCALIZATION_LANGUAGE_MISMATCH');
        }
        generated = await this.translate(
          report,
          source,
          language,
          requestId,
          'The previous provider returned text in the wrong language. Translate every supplied item into the requested target language.',
          this.alternateProvider(generated.provider),
          1,
        );
        translations = this.validatePaths(
          source,
          generated.output.translations,
        );
        if (!this.languageMatches(translations, language, report, requestId)) {
          throw new Error('REPORT_LOCALIZATION_LANGUAGE_MISMATCH');
        }
      }
      const content = this.applyTranslations(
        canonicalProjection,
        translations,
        language,
        ReportLocalizationStatus.COMPLETE,
        [],
      );
      await this.localizationModel.updateOne(
        { ...key, leaseToken },
        {
          $set: {
            status: ReportLocalizationStatus.COMPLETE,
            content: { translations },
            provider: generated.provider,
            model: generated.model,
            limitations: [],
            generatedAt: new Date(),
            retryable: false,
          },
          $unset: {
            retryAfter: 1,
            failureCode: 1,
            leaseToken: 1,
            leaseExpiresAt: 1,
          },
        },
        { runValidators: true },
      );
      return content;
    } catch (error) {
      const failureCode = this.failureCode(error);
      const retryable = this.retryableFailure(failureCode);
      const limitation =
        'The requested report translation could not be validated, so canonical English analysis is shown. Original claims and evidence remain unchanged.';
      this.logger.warn({
        event: 'report_localization_fallback',
        reportId: report._id.toString(),
        language,
        failureCode,
        retryable,
        ...(error instanceof ExternalProviderException && error.operatorDetails
          ? { providerDetails: error.operatorDetails }
          : {}),
      });
      const content = this.applyTranslations(
        canonicalProjection,
        [],
        SupportedLanguage.ENGLISH,
        ReportLocalizationStatus.FALLBACK,
        [limitation],
      );
      await this.localizationModel.updateOne(
        { ...key, leaseToken },
        {
          $set: {
            status: ReportLocalizationStatus.FALLBACK,
            content: { translations: [] },
            limitations: [limitation],
            generatedAt: new Date(),
            failureCode,
            retryable,
            ...(retryable
              ? { retryAfter: new Date(Date.now() + 15 * 60 * 1000) }
              : {}),
          },
          $unset: {
            leaseToken: 1,
            leaseExpiresAt: 1,
            ...(!retryable ? { retryAfter: 1 } : {}),
          },
        },
        { runValidators: true },
      );
      return content;
    }
  }

  private translate(
    report: Report & { _id: Types.ObjectId },
    items: TranslationItem[],
    language: SupportedLanguage,
    requestId: string,
    repairInstruction: string,
    preferredProvider: AiProviderName | undefined,
    maxProviderCalls: number,
  ) {
    return this.ai.execute<TranslationOutput>({
      capability: AiCapability.TRANSLATION,
      promptKey: 'report.localization',
      variables: {
        targetLanguage: SUPPORTED_LANGUAGE_LABELS[language],
        targetLanguageCode: language,
        repairInstruction,
        content: JSON.stringify({ translations: items }),
      },
      outputSchemaName: 'ReportLocalization',
      outputSchemaVersion: ReportLocalizationService.VERSION,
      outputJsonSchema,
      outputValidator,
      requestId,
      verificationId: report.verificationId.toString(),
      maxOutputTokens: 8000,
      reasoningEffort: 'none',
      maxProviderCalls,
      allowSchemaCorrection: false,
      ...(preferredProvider ? { preferredProvider } : {}),
    });
  }

  private alternateProvider(provider: AiProviderName): AiProviderName {
    if (provider === AiProviderName.VERTEX) return AiProviderName.BEDROCK;
    if (provider === AiProviderName.BEDROCK) return AiProviderName.GROQ;
    if (provider === AiProviderName.GROQ) return AiProviderName.VERTEX;
    return AiProviderName.VERTEX;
  }

  private cachedProjection(
    canonical: Record<string, unknown>,
    language: SupportedLanguage,
    cached: ReportLocalization | null,
  ): Record<string, unknown> {
    const complete = cached?.status === ReportLocalizationStatus.COMPLETE;
    const translations =
      complete && Array.isArray(cached.content?.translations)
        ? (cached.content.translations as TranslationItem[])
        : [];
    const status = cached?.status ?? ReportLocalizationStatus.FALLBACK;
    const limitations = complete
      ? []
      : cached?.limitations?.length
        ? cached.limitations
        : status === ReportLocalizationStatus.PENDING
          ? [
              'The requested report translation is being prepared. Canonical English analysis is shown for now.',
            ]
          : [
              'The requested report translation is not available yet. Canonical English analysis is shown.',
            ];
    return {
      ...this.applyTranslations(
        canonical,
        translations,
        complete ? language : SupportedLanguage.ENGLISH,
        status,
        limitations,
      ),
      localizationRetryable:
        cached?.retryable === true ||
        (cached?.status === ReportLocalizationStatus.FALLBACK &&
          Boolean(
            cached.failureCode && this.retryableFailure(cached.failureCode),
          )) ||
        !cached,
      localizationFailureCode: cached?.failureCode ?? null,
      localizationRetryAfter: cached?.retryAfter ?? null,
    };
  }

  private failureCode(error: unknown): string {
    if (error instanceof ApplicationException) return error.code;
    if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message))
      return error.message;
    return 'REPORT_LOCALIZATION_FAILED';
  }

  private retryableFailure(code: string): boolean {
    return (
      code.endsWith('RATE_LIMITED') ||
      code.endsWith('TIMEOUT') ||
      code.endsWith('UNAVAILABLE') ||
      code.endsWith('INVALID_RESPONSE') ||
      code.endsWith('INVALID_JSON') ||
      code.endsWith('OUTPUT_TRUNCATED') ||
      code === 'AI_OUTPUT_VALIDATION_FAILED' ||
      code === 'REPORT_LOCALIZATION_PATH_MISMATCH' ||
      code === 'REPORT_LOCALIZATION_LANGUAGE_MISMATCH' ||
      code === 'AI_PROVIDER_UNAVAILABLE' ||
      code === 'REPORT_LOCALIZATION_FAILED'
    );
  }

  private isDuplicate(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000,
    );
  }

  private translationItems(value: Record<string, unknown>): TranslationItem[] {
    const items: TranslationItem[] = [];
    const add = (path: string, text: unknown) => {
      if (typeof text === 'string' && text.trim()) items.push({ path, text });
    };
    add('/summary', value.summary);
    this.array(value.claims).forEach((claim, index) => {
      add(`/claims/${index}/displayText`, claim.canonicalText ?? claim.text);
      add(`/claims/${index}/explanation`, claim.explanation);
      this.stringArray(claim.uncertainties).forEach((text, itemIndex) =>
        add(`/claims/${index}/uncertainties/${itemIndex}`, text),
      );
      this.stringArray(claim.limitations).forEach((text, itemIndex) =>
        add(`/claims/${index}/limitations/${itemIndex}`, text),
      );
    });
    this.array(value.manipulationAnalysis).forEach((item, index) =>
      add(`/manipulationAnalysis/${index}/explanation`, item.explanation),
    );
    this.array(value.biasAnalysis).forEach((item, index) =>
      add(`/biasAnalysis/${index}/explanation`, item.explanation),
    );
    this.array(value.missingContext).forEach((item, index) => {
      add(`/missingContext/${index}/whyItMatters`, item.whyItMatters);
      add(`/missingContext/${index}/correctedContext`, item.correctedContext);
    });
    this.stringArray(value.recommendedActions).forEach((text, index) =>
      add(`/recommendedActions/${index}`, text),
    );
    this.array(value.learningRecommendations).forEach((item, index) =>
      add(`/learningRecommendations/${index}/reason`, item.reason),
    );
    this.stringArray(value.limitations).forEach((text, index) =>
      add(`/limitations/${index}`, text),
    );
    return items;
  }

  private validatePaths(
    source: TranslationItem[],
    translated: TranslationItem[],
  ): TranslationItem[] {
    const expected = new Set(source.map((item) => item.path));
    const actual = new Map(translated.map((item) => [item.path, item.text]));
    if (
      actual.size !== expected.size ||
      [...expected].some((path) => !actual.has(path))
    ) {
      throw new Error('REPORT_LOCALIZATION_PATH_MISMATCH');
    }
    return source.map((item) => ({
      path: item.path,
      text: actual.get(item.path)!,
    }));
  }

  private languageMatches(
    translations: TranslationItem[],
    language: SupportedLanguage,
    report: Report & { _id: Types.ObjectId },
    requestId: string,
  ): boolean {
    const sample = translations
      .map((item) => item.text)
      .join(' ')
      .slice(0, 20000);
    if (sample.length < 80) return true;
    const compliance = this.languages.assessExpectedLanguage(sample, language);
    this.logger.log({
      event: 'report_localization_language_validated',
      requestId,
      reportId: report._id.toString(),
      verificationId: report.verificationId.toString(),
      expectedLanguage: language,
      detectedLanguage: compliance.language,
      detectedConfidence: Number(compliance.confidence.toFixed(3)),
      expectedLexicalConfidence: Number(
        compliance.expectedLexicalConfidence.toFixed(3),
      ),
      detectedLexicalConfidence: Number(
        compliance.detectedLexicalConfidence.toFixed(3),
      ),
      matches: compliance.matches,
      translatedItemCount: translations.length,
      sampleCharacters: sample.length,
    });
    return compliance.matches;
  }

  private applyTranslations(
    canonical: Record<string, unknown>,
    translations: TranslationItem[],
    presentationLanguage: SupportedLanguage,
    status: ReportLocalizationStatus,
    localizationLimitations: string[],
  ): Record<string, unknown> {
    const output = structuredClone(canonical);
    for (const { path, text } of translations) this.setPath(output, path, text);
    return {
      ...output,
      presentationLanguage,
      localizationStatus: status,
      localizationLimitations,
    };
  }

  private setPath(
    target: Record<string, unknown>,
    path: string,
    value: string,
  ) {
    const parts = path.slice(1).split('/');
    let cursor: unknown = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!cursor || typeof cursor !== 'object') return;
      cursor = (cursor as Record<string, unknown>)[parts[index]!];
    }
    if (cursor && typeof cursor === 'object') {
      (cursor as Record<string, unknown>)[parts.at(-1)!] = value;
    }
  }

  private array(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object',
        )
      : [];
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
