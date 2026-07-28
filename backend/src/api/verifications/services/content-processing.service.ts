import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { ApplicationException } from '../../../core/exceptions';
import { VerificationEventStatus } from '../enums/verification-event-status.enum';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import { VerificationStage } from '../enums/verification-stage.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import { UrlExtractionState } from '../enums/url-extraction-state.enum';
import {
  ExtractedContent,
  type ExtractedContentDocument,
} from '../schemas/extracted-content.schema';
import type { VerificationDocument } from '../schemas/verification.schema';
import { ArticleExtractionService } from './article-extraction.service';
import { ClaimExtractionService } from './claim-extraction.service';
import { VerificationEventService } from './verification-event.service';
import { LanguageDetectionService } from './language-detection.service';
import { TextNormalizationService } from './text-normalization.service';

@Injectable()
export class ContentProcessingService {
  constructor(
    @InjectModel(ExtractedContent.name)
    private readonly contentModel: Model<ExtractedContent>,
    private readonly articles: ArticleExtractionService,
    private readonly normalization: TextNormalizationService,
    private readonly languages: LanguageDetectionService,
    private readonly claims: ClaimExtractionService,
    private readonly events: VerificationEventService,
  ) {}

  async process(
    verification: VerificationDocument,
    requestId: string,
    jobId: string,
  ): Promise<void> {
    if (
      ![VerificationSourceType.TEXT, VerificationSourceType.URL].includes(
        verification.sourceType,
      )
    ) {
      return;
    }
    try {
      const extracted = await this.extractContent(verification);
      verification.currentStage = VerificationStage.CONTENT_EXTRACTION;
      verification.progress = 20;
      if (extracted.title && !verification.title) {
        verification.title = extracted.title;
      }
      if (extracted.urlMetadata) {
        verification.urlMetadata = extracted.urlMetadata;
      }
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.CONTENT_EXTRACTION,
        status: VerificationEventStatus.COMPLETED,
        progress: 20,
        messageCode: 'CONTENT_EXTRACTION_COMPLETED',
        safeMessage: 'The submitted content was extracted and normalized',
        requestId,
        jobId,
      });

      const language = this.languages.detect(extracted.record.normalizedText);
      verification.currentStage = VerificationStage.LANGUAGE_DETECTION;
      verification.progress = 25;
      verification.detectedLanguage = language.language;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.LANGUAGE_DETECTION,
        status: VerificationEventStatus.COMPLETED,
        progress: 25,
        messageCode: 'LANGUAGE_DETECTED',
        safeMessage: 'The content language was detected',
        metrics: { confidence: language.confidence },
        requestId,
        jobId,
      });

      verification.currentStage = VerificationStage.CLAIM_EXTRACTION;
      verification.progress = 30;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.CLAIM_EXTRACTION,
        status: VerificationEventStatus.ACTIVE,
        progress: 30,
        messageCode: 'CLAIM_EXTRACTION_STARTED',
        safeMessage: 'Factual claims are being extracted',
        requestId,
        jobId,
      });
      const count = await this.claims.extractAndPersist(
        verification.id,
        extracted.record.normalizedText,
        language.language,
        requestId,
      );
      verification.claimsCount = count;
      verification.currentStage = VerificationStage.SEARCH_QUERY_GENERATION;
      verification.progress = 40;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.SEARCH_QUERY_GENERATION,
        status: VerificationEventStatus.COMPLETED,
        progress: 40,
        messageCode: 'SEARCH_QUERIES_GENERATED',
        safeMessage: 'Evidence-search queries were generated',
        metrics: { claimsCount: count },
        requestId,
        jobId,
      });

      verification.currentStage = VerificationStage.EVIDENCE_SEARCH;
      verification.progress = 45;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.EVIDENCE_SEARCH,
        status: VerificationEventStatus.PENDING,
        progress: 45,
        messageCode: 'EVIDENCE_SEARCH_PENDING',
        safeMessage: 'The verification is awaiting evidence search',
        requestId,
        jobId,
      });
    } catch (error) {
      const code =
        error instanceof ApplicationException
          ? error.code
          : 'CONTENT_PROCESSING_FAILED';
      verification.status = VerificationStatus.FAILED;
      verification.failedAt = new Date();
      verification.failureCode = code;
      verification.failureSummary = 'Content processing could not be completed';
      this.applyUrlFailureState(verification, code);
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: verification.currentStage,
        status:
          code.includes('NOT_CONFIGURED') || code.includes('UNAVAILABLE')
            ? VerificationEventStatus.UNAVAILABLE
            : VerificationEventStatus.FAILED,
        progress: verification.progress,
        messageCode: code,
        safeMessage: 'Content processing could not be completed',
        requestId,
        jobId,
      });
    }
  }

  private async extractContent(verification: VerificationDocument): Promise<{
    record: ExtractedContentDocument;
    title?: string;
    urlMetadata?: Record<string, unknown>;
  }> {
    if (verification.sourceType === VerificationSourceType.TEXT) {
      const text =
        typeof verification.input.text === 'string'
          ? this.normalization.normalize(verification.input.text)
          : '';
      if (!text) throw new Error('Stored text input is unavailable');
      const record = await this.upsertContent(verification.id, text, {});
      return { record };
    }
    const url =
      typeof verification.input.url === 'string' ? verification.input.url : '';
    if (!url) throw new Error('Stored URL input is unavailable');
    const article = await this.articles.extract(url);
    if (
      ![
        UrlExtractionState.EXTRACTED,
        UrlExtractionState.PARTIALLY_EXTRACTED,
      ].includes(article.state)
    ) {
      verification.urlMetadata = {
        extractionState: article.state,
        canonicalUrl: article.canonicalUrl,
      };
      throw new ApplicationException(
        'The article content is not accessible',
        422,
        `URL_${article.state}`,
      );
    }
    const record = await this.upsertContent(verification.id, article.text, {
      sourceUrl: article.sourceUrl,
      canonicalUrl: article.canonicalUrl,
      ...(article.title ? { title: article.title } : {}),
      ...(article.publisher ? { publisher: article.publisher } : {}),
      ...(article.author ? { author: article.author } : {}),
      ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}),
      extractionState: article.state,
      extractionConfidence: article.confidence,
    });
    return {
      record,
      ...(article.title ? { title: article.title } : {}),
      urlMetadata: {
        extractionState: article.state,
        canonicalUrl: article.canonicalUrl,
        publisher: article.publisher ?? null,
        author: article.author ?? null,
        publishedAt: article.publishedAt ?? null,
        extractionConfidence: article.confidence,
      },
    };
  }

  private async upsertContent(
    verificationId: string,
    normalizedText: string,
    metadata: Partial<ExtractedContent>,
  ): Promise<ExtractedContentDocument> {
    const record = await this.contentModel
      .findOneAndUpdate(
        { verificationId: new Types.ObjectId(verificationId) },
        {
          $set: {
            normalizedText,
            normalizedContentHash: createHash('sha256')
              .update(normalizedText)
              .digest('hex'),
            ...metadata,
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!record) throw new Error('Extracted content could not be persisted');
    return record;
  }

  private applyUrlFailureState(
    verification: VerificationDocument,
    code: string,
  ): void {
    if (verification.sourceType !== VerificationSourceType.URL) return;
    const state =
      code === 'URL_NOT_FOUND'
        ? UrlExtractionState.NOT_FOUND
        : code === 'URL_FETCH_TIMEOUT'
          ? UrlExtractionState.TIMEOUT
          : code === 'URL_PAYWALLED'
            ? UrlExtractionState.PAYWALLED
            : code === 'URL_LOGIN_REQUIRED'
              ? UrlExtractionState.LOGIN_REQUIRED
              : code.startsWith('VALIDATION')
                ? UrlExtractionState.UNSAFE_URL
                : code === 'URL_ACCESS_BLOCKED'
                  ? UrlExtractionState.BLOCKED
                  : UrlExtractionState.UNSUPPORTED;
    verification.urlMetadata = {
      ...(verification.urlMetadata ?? {}),
      extractionState: state,
      failureCode: code,
    };
  }
}
