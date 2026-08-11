import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import { Verification } from '../../verifications/schemas/verification.schema';
import { ReportStatus, ReportVisibility } from '../enums/report.enum';
import { Report, type ReportDocument } from '../schemas/report.schema';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { AnalyticsEventType } from '../../analytics/enums/analytics-event.enum';

export interface CheckCardView {
  reportVersion: number;
  claim: string;
  finding: string;
  summary: string;
  keyEvidence: Array<{
    title: string;
    publisher: string | null;
    relationship: string;
    sourceUrl: string;
  }>;
  missingContext: string | null;
  recommendedCheck: string;
  limitation: string;
  reportDate: string;
  publicReportUrl: string | null;
  shareState: 'READY' | 'PRIVATE';
  shareMetadata: {
    title: string;
    description: string;
    url: string | null;
  };
}

@Injectable()
export class CheckCardService {
  constructor(
    @InjectModel(Report.name) private readonly reports: Model<Report>,
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {}

  async forOwner(userId: string, reportId: string): Promise<CheckCardView> {
    const report = await this.reports.findById(reportId).exec();
    if (!report) throw this.notFound();
    const owned = await this.verifications.exists({
      _id: report.verificationId,
      userId: new Types.ObjectId(userId),
      status: { $ne: VerificationStatus.DELETED },
    });
    if (!owned) throw this.notFound();
    if (
      ![
        ReportStatus.COMPLETE,
        ReportStatus.PARTIAL,
        ReportStatus.SUPERSEDED,
      ].includes(report.status)
    )
      throw new ValidationException(
        'A Check Card can only be generated from a completed report',
      );
    const card = this.fromReport(report);
    await this.analytics.recordEvent(userId, {
      event: AnalyticsEventType.CHECK_CARD_CREATED,
      reportId,
      verificationId: report.verificationId.toString(),
    });
    return card;
  }

  renderSvg(card: CheckCardView): Buffer {
    const evidence = card.keyEvidence[0];
    const lines = [
      ['Claim', card.claim],
      ['What Verith found', card.summary],
      ['Check next', card.recommendedCheck],
      ['Important limitation', card.limitation],
    ] as const;
    const lineMarkup = lines
      .map(
        ([label, value], index) =>
          `<text x="72" y="${250 + index * 125}" class="label">${this.xml(label)}</text>` +
          this.svgLines(this.shorten(value, 112), 72, 282 + index * 125),
      )
      .join('');
    const sourceMarkup = evidence
      ? `<text x="72" y="760" class="label">Key evidence</text>${this.svgLines(
          this.shorten(
            `${evidence.title} — ${evidence.publisher ?? 'publisher not recorded'}`,
            112,
          ),
          72,
          792,
        )}`
      : `<text x="72" y="760" class="label">Key evidence</text><text x="72" y="792" class="body">No readable supporting or contradicting source was retained.</text>`;
    const share = card.publicReportUrl
      ? this.shorten(card.publicReportUrl, 90)
      : 'Private card · publish or unlist the report before sharing';
    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000" role="img" aria-labelledby="title desc">
<title id="title">Verith Check Card</title><desc id="desc">A concise, public-safe summary generated from report version ${card.reportVersion}.</desc>
<defs><radialGradient id="glow" cx="10%" cy="0%" r="100%"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".42"/><stop offset=".5" stop-color="#09090b"/><stop offset="1" stop-color="#030304"/></radialGradient><linearGradient id="line"><stop stop-color="#c084fc"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
<rect width="1200" height="1000" rx="54" fill="url(#glow)"/><rect x="2" y="2" width="1196" height="996" rx="52" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="4"/>
<style>.brand{font:700 45px Arial,sans-serif;fill:#fff}.eyebrow,.label{font:700 17px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase}.eyebrow{fill:#c4b5fd}.label{fill:#67e8f9}.finding{font:700 64px Arial,sans-serif;fill:#fff}.body{font:400 24px Arial,sans-serif;fill:#e4e4e7}.meta{font:400 18px Arial,sans-serif;fill:#a1a1aa}</style>
<text x="72" y="83" class="brand">Verith</text><text x="72" y="120" class="eyebrow">Evidence-first check card</text><rect x="72" y="153" width="1056" height="4" rx="2" fill="url(#line)"/>
<text x="72" y="216" class="finding">${this.xml(this.humanize(card.finding))}</text>${lineMarkup}${sourceMarkup}
<text x="72" y="916" class="meta">Report v${card.reportVersion} · ${this.xml(card.reportDate)}</text><text x="72" y="950" class="meta">${this.xml(share)}</text>
</svg>`);
  }

  private fromReport(report: ReportDocument): CheckCardView {
    const evidence = report.evidence ?? [];
    const keyEvidence = evidence
      .filter((item) =>
        ['SUPPORTING', 'CONTRADICTING'].includes(String(item.relationship)),
      )
      .slice(0, 2)
      .map((item) => ({
        title: this.safeString(item.title, 'Evidence source'),
        publisher: item.publisher ? this.safeString(item.publisher) : null,
        relationship: this.safeString(item.relationship),
        sourceUrl: this.safeString(item.sourceUrl),
      }))
      .filter((item) => /^https?:\/\//.test(item.sourceUrl));
    const missing = report.missingContext?.[0];
    const shareable =
      report.visibility !== ReportVisibility.PRIVATE &&
      Boolean(report.publicSlug) &&
      !report.publicAccessRevokedAt;
    const frontendUrl = this.config.get<string>('app.frontendUrl') ?? '';
    return {
      reportVersion: report.version,
      claim: this.safeString(
        report.claims?.[0]?.text,
        'No individual checkable claim was retained.',
      ),
      finding: String(report.overallVerdict),
      summary: report.summary,
      keyEvidence,
      missingContext: missing
        ? this.safeString(missing.omittedContext ?? missing.whyItMatters) ||
          null
        : null,
      recommendedCheck:
        report.recommendedActions?.[0] ??
        'Inspect the evidence and limitations before sharing.',
      limitation:
        report.limitations?.[0] ??
        'This card is a summary. Open the complete report for context.',
      reportDate: report.generatedAt.toISOString(),
      publicReportUrl: shareable
        ? `${frontendUrl.replace(/\/$/, '')}/reports/${report.publicSlug}`
        : null,
      shareState: shareable ? 'READY' : 'PRIVATE',
      shareMetadata: {
        title: `Verith Check Card: ${this.humanize(String(report.overallVerdict))}`,
        description: this.shorten(report.summary, 180),
        url: shareable
          ? `${frontendUrl.replace(/\/$/, '')}/reports/${report.publicSlug}`
          : null,
      },
    };
  }

  private svgLines(value: string, x: number, y: number): string {
    const words = value.split(/\s+/);
    const rows: string[] = [];
    let row = '';
    for (const word of words) {
      if (`${row} ${word}`.trim().length > 76) {
        if (row) rows.push(row);
        row = word;
      } else row = `${row} ${word}`.trim();
    }
    if (row) rows.push(row);
    return rows
      .slice(0, 2)
      .map(
        (item, index) =>
          `<text x="${x}" y="${y + index * 31}" class="body">${this.xml(item)}</text>`,
      )
      .join('');
  }

  private shorten(value: string, maximum: number): string {
    return value.length <= maximum
      ? value
      : `${value.slice(0, maximum - 1).trimEnd()}…`;
  }

  private humanize(value: string): string {
    return value.replaceAll('_', ' ').toLowerCase();
  }

  private safeString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private xml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  private notFound() {
    return new NotFoundException(
      'The requested report could not be found',
      'REPORT_NOT_FOUND',
    );
  }
}
