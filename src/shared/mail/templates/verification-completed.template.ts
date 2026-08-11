import {
  metadataValue,
  renderMailLayout,
  type MailTemplateDetail,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface VerificationCompletedTemplateInput {
  subject: string;
  message: string;
  productUrl: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export function renderVerificationCompletedTemplate(
  input: VerificationCompletedTemplateInput,
): RenderedMailTemplate {
  const verificationId = metadataValue(input.metadata, 'verificationId');
  const reportId = metadataValue(input.metadata, 'reportId');
  const details: MailTemplateDetail[] = [
    { label: 'Processing state', value: 'Complete' },
    ...(verificationId
      ? [{ label: 'Investigation reference', value: verificationId }]
      : []),
    ...(reportId ? [{ label: 'Report reference', value: reportId }] : []),
  ];

  return renderMailLayout({
    subject: 'Your Verith investigation report is ready',
    preheader:
      'Processing is complete. Review the findings, evidence relationships, uncertainty, and limitations in Verith.',
    eyebrow: 'Investigation update',
    title: 'Your report is ready for review',
    intro:
      'Verith has completed the investigation workflow and assembled an explainable report. Open the report to inspect how each conclusion relates to available evidence and where uncertainty remains.',
    productUrl: input.productUrl,
    ...(input.actionUrl
      ? { action: { label: 'Review the report', url: input.actionUrl } }
      : {}),
    details,
    sections: [
      {
        heading: 'What “complete” means',
        paragraphs: [
          'Complete describes the processing state. It does not mean a submitted claim was automatically proven true or false.',
          'A report may classify claims as supported, contradicted, mixed, outdated, unsupported, or limited by the evidence that could be retrieved.',
        ],
        tone: 'notice',
      },
      {
        heading: 'What to review in the report',
        bullets: [
          'The factual claims Verith identified in the submitted material.',
          'Supporting, contradicting, and contextual evidence relationships where available.',
          'Source links and source information that can be inspected independently.',
          'Missing-context or manipulation indicators when those analyses were available.',
          'Uncertainty, unavailable analysis, limitations, and recommended next steps.',
        ],
      },
      {
        heading: 'Your investigation remains evidence-led',
        paragraphs: [
          input.message,
          'Treat the report as a structured aid for critical review. Read the cited material, consider publication dates and context, and avoid presenting an AI-generated conclusion as absolute truth.',
        ],
      },
      {
        heading: 'Privacy reminder',
        paragraphs: [
          'Your report remains private unless you deliberately change its visibility or create a share link inside Verith. This email does not include the submitted content, verdict, or evidence excerpts.',
        ],
        tone: 'warning',
      },
    ],
    footerNote:
      'You received this product notification because a Verith investigation associated with your account finished processing. Eligible product email preferences can be changed in Verith settings.',
  });
}
