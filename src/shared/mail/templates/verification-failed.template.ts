import {
  metadataValue,
  renderMailLayout,
  type MailTemplateDetail,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface VerificationFailedTemplateInput {
  subject: string;
  message: string;
  productUrl: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export function renderVerificationFailedTemplate(
  input: VerificationFailedTemplateInput,
): RenderedMailTemplate {
  const verificationId = metadataValue(input.metadata, 'verificationId');
  const details: MailTemplateDetail[] = [
    { label: 'Processing state', value: 'Incomplete — attention required' },
    ...(verificationId
      ? [{ label: 'Investigation reference', value: verificationId }]
      : []),
  ];

  return renderMailLayout({
    subject: 'Your Verith investigation needs attention',
    preheader:
      'The investigation workflow could not finish. Review the recorded status and available next step in Verith.',
    eyebrow: 'Investigation update',
    title: 'We could not complete this investigation',
    intro:
      'Verith stopped the workflow because one or more required processing steps could not be completed. The incomplete state has not been converted into a finished conclusion.',
    productUrl: input.productUrl,
    ...(input.actionUrl
      ? { action: { label: 'Review the investigation', url: input.actionUrl } }
      : {}),
    details,
    sections: [
      {
        heading: 'What this status means',
        paragraphs: [
          input.message,
          'A processing failure is not a verdict about the submitted claim, source, image, link, or recording. It only means the investigation did not complete every required stage.',
        ],
        tone: 'warning',
      },
      {
        heading: 'Recommended next steps',
        bullets: [
          'Open the investigation in Verith to review its safe status details.',
          'Confirm that the submitted link still opens or that an uploaded file uses a supported format.',
          'Retry the investigation when that action is available.',
          'If an evidence or AI provider remains unavailable, wait before retrying; another attempt is not guaranteed to succeed immediately.',
        ],
      },
      {
        heading: 'What Verith will not do',
        paragraphs: [
          'Verith will not turn missing evidence, an unavailable provider, or an interrupted processing stage into a confident factual claim. Unavailable analysis remains unavailable until it can be completed safely.',
        ],
        tone: 'notice',
      },
      {
        heading: 'Privacy reminder',
        paragraphs: [
          'This email contains only operational status and a case reference. It does not reproduce your submitted content or expose investigation findings.',
        ],
      },
    ],
    footerNote:
      'You received this product notification because a Verith investigation associated with your account could not finish processing. Eligible product email preferences can be changed in Verith settings.',
  });
}
