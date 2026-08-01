/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-base-to-string */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type {
  ReportFeedbackAdminQueryDto,
  ResolveReportFeedbackDto,
} from '../dto/report-feedback-admin.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { ClaimEvaluation } from '../../analysis/schemas/claim-evaluation.schema';
import { OverallVerdict, RiskLevel } from '../../analysis/enums/analysis.enum';
import { VerificationAnalysis } from '../../analysis/schemas/verification-analysis.schema';
import { Evidence } from '../../evidence/schemas/evidence.schema';
import { MediaAnalysis } from '../../media/schemas/media-analysis.schema';
import { Transcript } from '../../media/schemas/transcript.schema';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import { VerificationStage } from '../../verifications/enums/verification-stage.enum';
import { VerificationVisibility } from '../../verifications/enums/verification-visibility.enum';
import { Claim } from '../../verifications/schemas/claim.schema';
import type { VerificationDocument } from '../../verifications/schemas/verification.schema';
import { Verification } from '../../verifications/schemas/verification.schema';
import type { ReportFeedbackDto } from '../dto/report.dto';
import {
  ReportExportFormat,
  ReportExportStatus,
  ReportFeedbackStatus,
  ReportStatus,
  ReportVisibility,
} from '../enums/report.enum';
import { ReportExport } from '../schemas/report-export.schema';
import { ReportFeedback } from '../schemas/report-feedback.schema';
import { Report, type ReportDocument } from '../schemas/report.schema';

@Injectable()
export class ReportService {
  static readonly SCHEMA_VERSION = 'report.v1';

  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<Report>,
    @InjectModel(ReportFeedback.name)
    private readonly feedbackModel: Model<ReportFeedback>,
    @InjectModel(ReportExport.name)
    private readonly exportModel: Model<ReportExport>,
    @InjectModel(Verification.name)
    private readonly verificationModel: Model<Verification>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(ClaimEvaluation.name)
    private readonly evaluationModel: Model<ClaimEvaluation>,
    @InjectModel(VerificationAnalysis.name)
    private readonly analysisModel: Model<VerificationAnalysis>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    @InjectModel(MediaAnalysis.name)
    private readonly mediaModel: Model<MediaAnalysis>,
    @InjectModel(Transcript.name)
    private readonly transcriptModel: Model<Transcript>,
    private readonly audit: AuditService,
  ) {}

  async listFeedback(query: ReportFeedbackAdminQueryDto) {
    const records = await this.feedbackModel
      .find({
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor
          ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
          : {}),
      })
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > query.limit;
    const items = records.slice(0, query.limit);
    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? items.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  async getFeedback(id: string) {
    const feedback = await this.feedbackModel.findById(id).lean().exec();
    if (!feedback)
      throw new NotFoundException(
        'The feedback record could not be found',
        'REPORT_FEEDBACK_NOT_FOUND',
      );
    return feedback;
  }

  async resolveFeedback(
    id: string,
    dto: ResolveReportFeedbackDto,
    actor: AuthUser,
    requestId: string,
  ) {
    const feedback = await this.feedbackModel.findById(id).exec();
    if (!feedback)
      throw new NotFoundException(
        'The feedback record could not be found',
        'REPORT_FEEDBACK_NOT_FOUND',
      );
    const before = { status: feedback.status };
    feedback.status = dto.status;
    feedback.resolution = dto.resolution;
    feedback.assignedModeratorId = new Types.ObjectId(actor.userId);
    if (
      dto.status === ReportFeedbackStatus.RESOLVED ||
      dto.status === ReportFeedbackStatus.DISMISSED
    )
      feedback.resolvedAt = new Date();
    else feedback.set('resolvedAt', undefined);
    await feedback.save();
    await this.audit.record({
      actor,
      action: 'REPORT_FEEDBACK_MODERATED',
      resourceType: 'REPORT_FEEDBACK',
      resourceId: id,
      requestId,
      reason: dto.reason,
      safeBefore: before,
      safeAfter: { status: feedback.status },
    });
    return feedback.toObject();
  }

  async synthesize(
    verification: VerificationDocument,
  ): Promise<ReportDocument> {
    const id = verification._id;
    const [analysis, claims, evaluations, evidence, media, transcript, latest] =
      await Promise.all([
        this.analysisModel.findOne({ verificationId: id }).lean().exec(),
        this.claimModel
          .find({ verificationId: id })
          .sort({ sequence: 1 })
          .lean()
          .exec(),
        this.evaluationModel.find({ verificationId: id }).lean().exec(),
        this.evidenceModel.find({ verificationId: id }).lean().exec(),
        this.mediaModel.findOne({ verificationId: id }).lean().exec(),
        this.transcriptModel.findOne({ verificationId: id }).lean().exec(),
        this.reportModel
          .findOne({ verificationId: id })
          .sort({ version: -1 })
          .lean()
          .exec(),
      ]);
    if (!analysis && !media)
      throw new ValidationException(
        'No completed analysis is available for reporting',
      );
    const version = (latest?.version ?? 0) + 1;
    const evaluationByClaim = new Map(
      evaluations.map((item) => [item.claimId.toString(), item]),
    );
    const claimItems = claims.map((claim) => {
      const evaluation = evaluationByClaim.get(claim._id.toString());
      return {
        claimId: claim._id.toString(),
        text: claim.text,
        importance: claim.importance,
        verifiability: claim.verifiability,
        verdict: evaluation?.verdict ?? 'UNVERIFIABLE',
        confidence: evaluation?.confidence ?? 0,
        explanation:
          evaluation?.explanation ?? 'No claim evaluation was applicable.',
        supportingEvidenceIds:
          evaluation?.supportingEvidenceIds.map(String) ?? [],
        contradictingEvidenceIds:
          evaluation?.contradictingEvidenceIds.map(String) ?? [],
        contextEvidenceIds: evaluation?.contextEvidenceIds.map(String) ?? [],
        uncertainties: evaluation?.uncertainties ?? [],
        limitations: evaluation?.limitations ?? [],
      };
    });
    const evidenceItems = evidence.map((item) => ({
      evidenceId: item._id.toString(),
      claimId: item.claimId.toString(),
      title: item.title,
      sourceUrl: item.sourceUrl,
      publisher: item.publisher ?? null,
      publishedAt: item.publishedAt ?? null,
      relevantExcerpt: item.relevantExcerpt ?? null,
      relationship: item.relationship,
      accessStatus: item.accessStatus,
      lineageType: item.lineageType,
    }));
    const limitations = [
      ...(analysis?.limitations ?? []),
      ...(media?.limitations ?? []),
      'This report distinguishes retrieved evidence from model-assisted inference and may change when new evidence becomes available.',
    ];
    const visibility =
      verification.visibility === VerificationVisibility.PUBLIC
        ? ReportVisibility.PUBLIC
        : verification.visibility === VerificationVisibility.UNLISTED
          ? ReportVisibility.UNLISTED
          : ReportVisibility.PRIVATE;
    const report = new this.reportModel({
      verificationId: id,
      version,
      status: ReportStatus.VALIDATING,
      overallVerdict:
        analysis?.overallVerdict ?? OverallVerdict.INSUFFICIENT_EVIDENCE,
      riskLevel: analysis?.riskLevel ?? RiskLevel.UNKNOWN,
      confidence: analysis?.confidence ?? 0,
      confidenceFactors: analysis?.confidenceFactors ?? {
        insufficientEvidence: true,
      },
      summary: this.summary(analysis?.overallVerdict, claimItems.length),
      claims: claimItems,
      evidence: evidenceItems,
      manipulationAnalysis: this.plainArray(
        analysis?.manipulationFindings ?? [],
      ),
      biasAnalysis: this.plainArray(analysis?.biasMetrics ?? []),
      missingContext: this.plainArray(analysis?.missingContextIssues ?? []),
      sourceCredibility: this.plainArray(analysis?.sourceAssessments ?? []),
      ...(media ? { mediaAnalysis: this.mediaProjection(media) } : {}),
      ...(transcript
        ? { audioAnalysis: this.transcriptProjection(transcript) }
        : {}),
      ...(media
        ? {
            aiIndicators: {
              indicator: media.aiIndicator,
              confidence: media.aiIndicatorConfidence,
              observations: media.aiObservations,
              limitations: media.aiLimitations,
              specializedDetectorUsed: media.specializedDetectorUsed,
            },
          }
        : {}),
      recommendedActions: this.actions(
        analysis?.riskLevel ?? 'UNKNOWN',
        analysis?.overallVerdict ?? 'INSUFFICIENT_EVIDENCE',
      ),
      learningRecommendations: this.learningRecommendations(claims),
      limitations: [...new Set(limitations)],
      methodologyVersions: {
        report: ReportService.SCHEMA_VERSION,
        analysis: analysis?.methodVersion ?? 'unavailable',
        media: media
          ? media.mediaKind === 'VIDEO' || media.likelyContentType === 'video'
            ? 'video-analysis.v1'
            : 'image-analysis.v1'
          : 'not-applicable',
        transcription: transcript ? 'groq-transcription.v1' : 'not-applicable',
      },
      providerSummary: {
        analysisPromptVersion: analysis?.promptVersion ?? null,
        mediaProvider: media?.provider ?? null,
        transcriptionProvider: transcript?.provider ?? null,
      },
      schemaVersion: ReportService.SCHEMA_VERSION,
      generatedAt: new Date(),
      visibility,
      ...(visibility !== ReportVisibility.PRIVATE
        ? {
            publicSlug: randomBytes(24).toString('base64url'),
            publishedAt: new Date(),
          }
        : {}),
    });
    await report.save();
    const errors = this.validate(report, claims, evidence);
    if (errors.length) {
      report.status = ReportStatus.INVALID;
      report.limitations.push(...errors);
      await report.save();
      throw new ValidationException(
        'Report validation failed',
        errors.map((message) => ({
          field: 'report',
          message,
        })),
      );
    }
    await this.reportModel.updateMany(
      {
        verificationId: id,
        _id: { $ne: report._id },
        status: ReportStatus.COMPLETE,
      },
      { $set: { status: ReportStatus.SUPERSEDED } },
    );
    report.status = ReportStatus.COMPLETE;
    await report.save();
    verification.reportId = report._id;
    verification.latestReportVersion = version;
    verification.status = VerificationStatus.COMPLETED;
    verification.processingCompletedAt = new Date();
    verification.currentStage = VerificationStage.COMPLETED;
    verification.progress = 100;
    await verification.save();
    return report;
  }

  async latestOwned(userId: string, verificationId: string) {
    await this.assertOwnedVerification(userId, verificationId);
    const report = await this.reportModel
      .findOne({
        verificationId: new Types.ObjectId(verificationId),
        status: { $nin: [ReportStatus.DELETED, ReportStatus.INVALID] },
      })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (!report) throw this.notFound();
    return this.privateProjection(report);
  }

  async versionsOwned(userId: string, verificationId: string) {
    await this.assertOwnedVerification(userId, verificationId);
    const reports = await this.reportModel
      .find({
        verificationId: new Types.ObjectId(verificationId),
        status: { $nin: [ReportStatus.DELETED, ReportStatus.INVALID] },
      })
      .select(
        'version status overallVerdict riskLevel confidence visibility schemaVersion generatedAt publishedAt',
      )
      .sort({ version: -1 })
      .lean()
      .exec();
    return reports.map((report) => ({
      id: report._id.toString(),
      version: report.version,
      status: report.status,
      overallVerdict: report.overallVerdict,
      riskLevel: report.riskLevel,
      confidence: report.confidence,
      visibility: report.visibility,
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      publishedAt: report.publishedAt ?? null,
    }));
  }

  async getOwned(userId: string, reportId: string) {
    const report = await this.findOwned(userId, reportId);
    if ([ReportStatus.DELETED, ReportStatus.INVALID].includes(report.status))
      throw this.notFound();
    return this.privateProjection(report.toObject());
  }

  async setVisibility(
    userId: string,
    reportId: string,
    visibility: ReportVisibility,
  ) {
    const report = await this.findOwned(userId, reportId);
    report.visibility = visibility;
    if (visibility === ReportVisibility.PRIVATE) {
      report.set('publicSlug', undefined);
      report.publicAccessRevokedAt = new Date();
    } else {
      report.publicSlug ??= randomBytes(24).toString('base64url');
      report.set('publicAccessRevokedAt', undefined);
      report.publishedAt ??= new Date();
      if (report.status === ReportStatus.REVOKED)
        report.status = ReportStatus.COMPLETE;
    }
    await report.save();
    return this.privateProjection(report.toObject());
  }

  async revoke(userId: string, reportId: string) {
    const report = await this.findOwned(userId, reportId);
    report.visibility = ReportVisibility.PRIVATE;
    report.status = ReportStatus.REVOKED;
    report.publicAccessRevokedAt = new Date();
    report.set('publicSlug', undefined);
    await report.save();
    return this.privateProjection(report.toObject());
  }

  async publicBySlug(slug: string) {
    const report = await this.reportModel
      .findOne({
        publicSlug: slug,
        visibility: {
          $in: [ReportVisibility.UNLISTED, ReportVisibility.PUBLIC],
        },
        publicAccessRevokedAt: { $exists: false },
        status: ReportStatus.COMPLETE,
      })
      .lean()
      .exec();
    if (!report) throw this.notFound();
    return this.publicProjection(report);
  }

  async feedback(userId: string, reportId: string, dto: ReportFeedbackDto) {
    await this.findOwned(userId, reportId);
    return this.feedbackModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        reportId: new Types.ObjectId(reportId),
      },
      {
        $set: {
          type: dto.type,
          ...(dto.category ? { category: dto.category } : {}),
          ...(dto.comment ? { comment: dto.comment.trim() } : {}),
          status: ReportFeedbackStatus.OPEN,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
  }

  async remove(userId: string, reportId: string): Promise<void> {
    const report = await this.findOwned(userId, reportId);
    report.status = ReportStatus.DELETED;
    report.visibility = ReportVisibility.PRIVATE;
    report.publicAccessRevokedAt = new Date();
    report.set('publicSlug', undefined);
    await report.save();
    const latest = await this.reportModel
      .findOne({
        verificationId: report.verificationId,
        _id: { $ne: report._id },
        status: { $nin: [ReportStatus.DELETED, ReportStatus.INVALID] },
      })
      .sort({ version: -1 })
      .exec();
    await this.verificationModel.updateOne(
      { _id: report.verificationId },
      latest
        ? {
            $set: {
              reportId: latest._id,
              latestReportVersion: latest.version,
            },
          }
        : {
            $unset: { reportId: 1, latestReportVersion: 1 },
          },
    );
  }

  async export(
    userId: string,
    reportId: string,
    format: ReportExportFormat,
  ): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
    const report = await this.findOwned(userId, reportId);
    const projection = this.publicProjection(report.toObject());
    const record = await this.exportModel.create({
      userId: new Types.ObjectId(userId),
      reportId: report._id,
      format,
      status: ReportExportStatus.PROCESSING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    try {
      const bytes =
        format === ReportExportFormat.JSON
          ? Buffer.from(JSON.stringify(projection, null, 2))
          : await this.renderPdf(projection);
      record.status = ReportExportStatus.COMPLETE;
      record.bytes = bytes.length;
      record.contentHash = createHash('sha256').update(bytes).digest('hex');
      record.completedAt = new Date();
      await record.save();
      return {
        bytes,
        contentType:
          format === ReportExportFormat.JSON
            ? 'application/json'
            : 'application/pdf',
        filename: `verith-report-v${report.version}.${format.toLowerCase()}`,
      };
    } catch {
      record.status = ReportExportStatus.FAILED;
      record.failureCode = 'REPORT_EXPORT_FAILED';
      await record.save();
      throw new ValidationException('The report export could not be generated');
    }
  }

  private validate(
    report: ReportDocument,
    claims: Array<{ _id: Types.ObjectId }>,
    evidence: Array<{
      _id: Types.ObjectId;
      claimId: Types.ObjectId;
      sourceUrl: string;
    }>,
  ): string[] {
    const errors: string[] = [];
    const claimIds = new Set(claims.map((item) => item._id.toString()));
    const evidenceIds = new Set(evidence.map((item) => item._id.toString()));
    for (const claim of report.claims) {
      const claimId = String(claim.claimId ?? '');
      if (!claimIds.has(claimId)) errors.push('A claim reference is invalid.');
      for (const key of [
        'supportingEvidenceIds',
        'contradictingEvidenceIds',
        'contextEvidenceIds',
      ]) {
        const ids = Array.isArray(claim[key]) ? claim[key] : [];
        if (ids.some((value) => !evidenceIds.has(String(value))))
          errors.push('An evidence reference is invalid.');
      }
    }
    for (const item of evidence) {
      if (!claimIds.has(item.claimId.toString()))
        errors.push('Evidence belongs to an unknown claim.');
      try {
        const url = new URL(item.sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol))
          errors.push('An evidence URL protocol is invalid.');
      } catch {
        errors.push('An evidence URL is invalid.');
      }
    }
    for (const issue of report.missingContext) {
      const ids = Array.isArray(issue.evidenceIds) ? issue.evidenceIds : [];
      if (ids.some((value) => !evidenceIds.has(String(value))))
        errors.push('A missing-context evidence reference is invalid.');
    }
    if (report.confidence < 0 || report.confidence > 1)
      errors.push('Report confidence is outside the valid range.');
    if (report.schemaVersion !== ReportService.SCHEMA_VERSION)
      errors.push('Report schema version is invalid.');
    if (!report.limitations.length)
      errors.push('Required report limitations are absent.');
    if (!report.methodologyVersions.analysis)
      errors.push('Analysis methodology is absent.');
    return [...new Set(errors)];
  }

  private privateProjection(value: unknown): Record<string, unknown> {
    const report = value as Record<string, unknown>;
    return { ...report, _id: undefined, id: String(report._id) };
  }

  private publicProjection(
    report: Record<string, any>,
  ): Record<string, unknown> {
    return {
      schemaVersion: report.schemaVersion,
      version: report.version,
      status: report.status,
      overallVerdict: report.overallVerdict,
      riskLevel: report.riskLevel,
      confidence: report.confidence,
      confidenceFactors: report.confidenceFactors,
      summary: report.summary,
      claims: report.claims,
      evidence: report.evidence,
      manipulationAnalysis: report.manipulationAnalysis,
      biasAnalysis: report.biasAnalysis,
      missingContext: report.missingContext,
      sourceCredibility: report.sourceCredibility,
      mediaAnalysis: report.mediaAnalysis
        ? {
            status: report.mediaAnalysis.status,
            mediaKind:
              report.mediaAnalysis.mediaKind ??
              (report.mediaAnalysis.likelyContentType === 'video'
                ? 'VIDEO'
                : 'IMAGE'),
            language: report.mediaAnalysis.language,
            confidence: report.mediaAnalysis.confidence ?? null,
            likelyContentType: report.mediaAnalysis.likelyContentType ?? null,
            potentialCropping: report.mediaAnalysis.potentialCropping ?? null,
            reverseImageStatus: report.mediaAnalysis.reverseImageStatus,
            limitations: report.mediaAnalysis.limitations,
          }
        : null,
      audioAnalysis: report.audioAnalysis
        ? {
            language: report.audioAnalysis.language,
            duration: report.audioAnalysis.duration ?? null,
            status: report.audioAnalysis.status,
            limitations: report.audioAnalysis.limitations,
          }
        : null,
      aiIndicators: report.aiIndicators ?? null,
      recommendedActions: report.recommendedActions,
      learningRecommendations: report.learningRecommendations,
      limitations: report.limitations,
      methodologyVersions: report.methodologyVersions,
      generatedAt: report.generatedAt,
      publishedAt: report.publishedAt ?? null,
    };
  }

  private mediaProjection(media: Record<string, any>) {
    return {
      status: media.status,
      fullText: media.fullText,
      mediaKind:
        media.mediaKind ??
        (media.likelyContentType === 'video' ? 'VIDEO' : 'IMAGE'),
      spokenText: media.spokenText ?? null,
      onScreenText: media.lines ?? [],
      blocks: media.blocks ?? [],
      language: media.language,
      confidence: media.confidence ?? null,
      uncertainRegions: media.uncertainRegions,
      visibleDates: media.visibleDates,
      visibleUrls: media.visibleUrls,
      visiblePublisherNames: media.visiblePublisherNames,
      likelyContentType: media.likelyContentType ?? null,
      potentialCropping: media.potentialCropping ?? null,
      reverseImageStatus: media.reverseImageStatus,
      limitations: media.limitations,
    };
  }

  private transcriptProjection(transcript: Record<string, any>) {
    return {
      language: transcript.language,
      duration: transcript.duration ?? null,
      fullText: transcript.fullText,
      segments: transcript.segments,
      averageConfidence: transcript.averageConfidence ?? null,
      status: transcript.status,
      limitations: transcript.limitations,
    };
  }

  private summary(verdict: unknown, count: number): string {
    return `Verith evaluated ${count} extracted claim${count === 1 ? '' : 's'}. The evidence-derived overall assessment is ${String(
      verdict ?? 'INSUFFICIENT_EVIDENCE',
    )
      .replaceAll('_', ' ')
      .toLowerCase()}.`;
  }

  private actions(risk: unknown, verdict: unknown): string[] {
    const actions = [
      'Review the cited sources and limitations before sharing the content.',
      'Check whether newer primary-source information is available.',
    ];
    if (['HIGH', 'CRITICAL'].includes(String(risk)))
      actions.unshift(
        'Do not act on or redistribute this claim without independent confirmation.',
      );
    if (String(verdict) === 'INSUFFICIENT_EVIDENCE')
      actions.push('Treat the claim as unresolved rather than true or false.');
    return actions;
  }

  private learningRecommendations(claims: Array<{ claimType: unknown }>) {
    return [
      ...new Set(claims.map((item) => String(item.claimType).toLowerCase())),
    ]
      .slice(0, 5)
      .map((tag) => ({
        tag,
        reason: `Learn how to evaluate ${tag.replaceAll('_', ' ')} claims and source quality.`,
        lessonId: null,
        availability: 'CATALOG_MATCH_PENDING',
      }));
  }

  private plainArray(values: unknown[]): Record<string, unknown>[] {
    return JSON.parse(JSON.stringify(values)) as Record<string, unknown>[];
  }

  private async renderPdf(report: Record<string, any>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.fontSize(22).text('VERITH', { align: 'center' });
      document
        .fontSize(10)
        .text('Explainable verification report', { align: 'center' });
      document.moveDown();
      document
        .fontSize(12)
        .text(`Report date: ${new Date(report.generatedAt).toISOString()}`);
      document.text(`Version: ${report.version}`);
      document.text(`Verdict: ${report.overallVerdict}`);
      document.text(`Risk: ${report.riskLevel}`);
      document.text(
        `Confidence: ${Math.round(Number(report.confidence) * 100)}%`,
      );
      document.moveDown().fontSize(16).text('Summary');
      document.fontSize(10).text(String(report.summary));
      this.pdfList(
        document,
        'Claims',
        report.claims,
        (item) =>
          `${item.text}\nVerdict: ${item.verdict}; confidence: ${Math.round(Number(item.confidence) * 100)}%\n${item.explanation}`,
      );
      this.pdfList(
        document,
        'Evidence',
        report.evidence,
        (item) =>
          `${item.title}\n${item.sourceUrl}\nRelationship: ${item.relationship}; access: ${item.accessStatus}`,
      );
      this.pdfList(
        document,
        'Missing context',
        report.missingContext,
        (item) =>
          `${item.type}: ${item.whyItMatters}\n${item.correctedContext}`,
      );
      this.pdfList(
        document,
        'Manipulation findings',
        report.manipulationAnalysis,
        (item) => `${item.category} (${item.severity}): ${item.explanation}`,
      );
      this.pdfList(
        document,
        'Recommended actions',
        report.recommendedActions,
        String,
      );
      this.pdfList(document, 'Limitations', report.limitations, String);
      document.end();
    });
  }

  private pdfList(
    document: PDFKit.PDFDocument,
    heading: string,
    items: any[],
    render: (item: any) => string,
  ) {
    document.moveDown().fontSize(16).text(heading);
    if (!items?.length) {
      document.fontSize(10).text('None recorded.');
      return;
    }
    for (const item of items) {
      document.fontSize(10).text(`• ${render(item)}`, { paragraphGap: 5 });
    }
  }

  private async assertOwnedVerification(
    userId: string,
    verificationId: string,
  ) {
    const exists = await this.verificationModel.exists({
      _id: new Types.ObjectId(verificationId),
      userId: new Types.ObjectId(userId),
      status: { $ne: VerificationStatus.DELETED },
    });
    if (!exists) throw this.notFound();
  }

  private async findOwned(
    userId: string,
    reportId: string,
  ): Promise<ReportDocument> {
    const report = await this.reportModel.findById(reportId).exec();
    if (!report) throw this.notFound();
    await this.assertOwnedVerification(
      userId,
      report.verificationId.toString(),
    );
    return report;
  }

  private notFound() {
    return new NotFoundException(
      'The report could not be found',
      'REPORT_NOT_FOUND',
    );
  }
}
