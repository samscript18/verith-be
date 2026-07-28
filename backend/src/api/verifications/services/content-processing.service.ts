import { Inject, Injectable, forwardRef } from '@nestjs/common';
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
import { EvidenceSearchService } from './evidence-search.service';
import { VerificationAnalysisService } from '../../analysis/services/verification-analysis.service';
import { MediaProcessingService } from '../../media/services/media-processing.service';
import { ReportService } from '../../reports/services/report.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { WhatsAppService } from '../../whatsapp/services/whatsapp.service';

@Injectable()
export class ContentProcessingService {
  constructor(
    @InjectModel(ExtractedContent.name)
    private readonly contentModel: Model<ExtractedContent>,
    private readonly articles: ArticleExtractionService,
    private readonly normalization: TextNormalizationService,
    private readonly languages: LanguageDetectionService,
    private readonly claims: ClaimExtractionService,
    private readonly evidence: EvidenceSearchService,
    private readonly analysis: VerificationAnalysisService,
    private readonly media: MediaProcessingService,
    private readonly reports: ReportService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsapp: WhatsAppService,
    private readonly events: VerificationEventService,
  ) {}

  async process(
    verification: VerificationDocument,
    requestId: string,
    jobId: string,
  ): Promise<void> {
    try {
      const extracted = await this.extractContent(verification, requestId);
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
      if (
        [
          VerificationSourceType.IMAGE,
          VerificationSourceType.SCREENSHOT,
          VerificationSourceType.WHATSAPP_IMAGE,
        ].includes(verification.sourceType)
      ) {
        await this.events.append({
          verificationId: verification.id,
          stage: VerificationStage.OCR,
          status: VerificationEventStatus.COMPLETED,
          progress: 20,
          messageCode: 'OCR_COMPLETED',
          safeMessage: 'Visible text and image context were analyzed',
          requestId,
          jobId,
        });
      } else if (
        [
          VerificationSourceType.AUDIO,
          VerificationSourceType.WHATSAPP_AUDIO,
        ].includes(verification.sourceType)
      ) {
        await this.events.append({
          verificationId: verification.id,
          stage: VerificationStage.TRANSCRIPTION,
          status: VerificationEventStatus.COMPLETED,
          progress: 20,
          messageCode: 'TRANSCRIPTION_COMPLETED',
          safeMessage: 'The audio was transcribed',
          requestId,
          jobId,
        });
      }
      if (!extracted.record) {
        verification.currentStage = VerificationStage.REPORT_SYNTHESIS;
        verification.progress = 60;
        await verification.save();
        for (const stage of [
          VerificationStage.LANGUAGE_DETECTION,
          VerificationStage.CLAIM_EXTRACTION,
          VerificationStage.EVIDENCE_SEARCH,
          VerificationStage.CLAIM_EVALUATION,
        ]) {
          await this.events.append({
            verificationId: verification.id,
            stage,
            status: VerificationEventStatus.SKIPPED,
            progress: 60,
            messageCode: `${stage}_SKIPPED_NO_TEXT`,
            safeMessage:
              'This stage does not apply because no text was detected',
            requestId,
            jobId,
          });
        }
        await this.events.append({
          verificationId: verification.id,
          stage: VerificationStage.REPORT_SYNTHESIS,
          status: VerificationEventStatus.PENDING,
          progress: 60,
          messageCode: 'REPORT_SYNTHESIS_PENDING',
          safeMessage: 'The verification is awaiting report synthesis',
          requestId,
          jobId,
        });
        await this.finalizeReport(verification, requestId, jobId);
        return;
      }
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
      const evidenceCount = await this.evidence.searchAndPersist(
        verification.id,
        requestId,
      );
      verification.evidenceCount = evidenceCount;
      verification.currentStage = VerificationStage.EVIDENCE_NORMALIZATION;
      verification.progress = 60;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.EVIDENCE_SEARCH,
        status: VerificationEventStatus.COMPLETED,
        progress: 50,
        messageCode: 'EVIDENCE_SEARCH_COMPLETED',
        safeMessage: 'Potential evidence sources were searched',
        metrics: { evidenceCount },
        requestId,
        jobId,
      });
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.EVIDENCE_RETRIEVAL,
        status: VerificationEventStatus.COMPLETED,
        progress: 55,
        messageCode: 'EVIDENCE_RETRIEVAL_COMPLETED',
        safeMessage: 'Accessible evidence pages were retrieved',
        metrics: { evidenceCount },
        requestId,
        jobId,
      });
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.EVIDENCE_NORMALIZATION,
        status: VerificationEventStatus.COMPLETED,
        progress: 60,
        messageCode: 'EVIDENCE_NORMALIZATION_COMPLETED',
        safeMessage: 'Evidence was normalized and duplicate lineage recorded',
        metrics: { evidenceCount },
        requestId,
        jobId,
      });
      verification.currentStage = VerificationStage.CLAIM_EVALUATION;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.CLAIM_EVALUATION,
        status: VerificationEventStatus.PENDING,
        progress: 60,
        messageCode: 'CLAIM_EVALUATION_PENDING',
        safeMessage: 'The verification is awaiting claim evaluation',
        requestId,
        jobId,
      });
      await this.analysis.analyze(verification.id, requestId);
      for (const stage of [
        VerificationStage.CLAIM_EVALUATION,
        VerificationStage.MANIPULATION_ANALYSIS,
        VerificationStage.BIAS_ANALYSIS,
        VerificationStage.MISSING_CONTEXT_ANALYSIS,
        VerificationStage.SOURCE_CREDIBILITY_ANALYSIS,
      ]) {
        verification.currentStage = stage;
        verification.progress += 5;
        await verification.save();
        await this.events.append({
          verificationId: verification.id,
          stage,
          status: VerificationEventStatus.COMPLETED,
          progress: verification.progress,
          messageCode: `${stage}_COMPLETED`,
          safeMessage: 'The analysis stage was completed',
          requestId,
          jobId,
        });
      }
      verification.currentStage = VerificationStage.REPORT_SYNTHESIS;
      await verification.save();
      await this.events.append({
        verificationId: verification.id,
        stage: VerificationStage.REPORT_SYNTHESIS,
        status: VerificationEventStatus.PENDING,
        progress: verification.progress,
        messageCode: 'REPORT_SYNTHESIS_PENDING',
        safeMessage: 'The verification is awaiting report synthesis',
        requestId,
        jobId,
      });
      await this.finalizeReport(verification, requestId, jobId);
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
      await this.notifications
        .dispatch({
          userId: verification.userId.toString(),
          type: NotificationType.VERIFICATION_FAILED,
          title: 'Verification could not be completed',
          message:
            'Your verification could not be completed. You can review its status in Verith.',
          idempotencyReference: `verification:${verification.id}:failed`,
          metadata: { verificationId: verification.id, failureCode: code },
        })
        .catch(() => undefined);
    }
  }

  private async extractContent(
    verification: VerificationDocument,
    requestId: string,
  ): Promise<{
    record: ExtractedContentDocument | null;
    title?: string;
    urlMetadata?: Record<string, unknown>;
  }> {
    if (
      [
        VerificationSourceType.IMAGE,
        VerificationSourceType.SCREENSHOT,
        VerificationSourceType.AUDIO,
        VerificationSourceType.WHATSAPP_IMAGE,
        VerificationSourceType.WHATSAPP_AUDIO,
      ].includes(verification.sourceType)
    ) {
      const result = await this.media.process(verification, requestId);
      if (!result.text.trim()) return { record: null };
      const record = await this.upsertContent(
        verification.id,
        this.normalization.normalize(result.text),
        {},
      );
      return { record };
    }
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

  private async finalizeReport(
    verification: VerificationDocument,
    requestId: string,
    jobId: string,
  ): Promise<void> {
    const report = await this.reports.synthesize(verification);
    await this.events.append({
      verificationId: verification.id,
      stage: VerificationStage.REPORT_SYNTHESIS,
      status: VerificationEventStatus.COMPLETED,
      progress: 90,
      messageCode: 'REPORT_SYNTHESIS_COMPLETED',
      safeMessage: 'The explainable report was synthesized',
      metrics: { reportVersion: report.version },
      requestId,
      jobId,
    });
    await this.events.append({
      verificationId: verification.id,
      stage: VerificationStage.REPORT_VALIDATION,
      status: VerificationEventStatus.COMPLETED,
      progress: 95,
      messageCode: 'REPORT_VALIDATION_COMPLETED',
      safeMessage: 'Report references and limitations were validated',
      requestId,
      jobId,
    });
    await this.events.append({
      verificationId: verification.id,
      stage: VerificationStage.COMPLETED,
      status: VerificationEventStatus.COMPLETED,
      progress: 100,
      messageCode: 'VERIFICATION_COMPLETED',
      safeMessage: 'Verification processing completed',
      requestId,
      jobId,
    });
    await this.notifications
      .dispatch({
        userId: verification.userId.toString(),
        type: NotificationType.VERIFICATION_COMPLETED,
        title: 'Verification complete',
        message: 'Your Verith verification report is ready to review.',
        idempotencyReference: `verification:${verification.id}:completed`,
        metadata: {
          verificationId: verification.id,
          reportId: report.id,
        },
      })
      .catch(() => undefined);
    await this.whatsapp
      .sendCompletion(
        verification.userId.toString(),
        verification.id,
        report.id,
      )
      .catch(() => undefined);
  }
}
