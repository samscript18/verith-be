import {
  formatExpiry,
  renderMailLayout,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface DataExportReadyTemplateInput {
  actionUrl: string;
  exportReference: string;
  expiresInMinutes: number;
  productUrl: string;
}

export function renderDataExportReadyTemplate(
  input: DataExportReadyTemplateInput,
): RenderedMailTemplate {
  const expiry = formatExpiry(input.expiresInMinutes);

  return renderMailLayout({
    subject: 'Your Verith data export is ready',
    preheader: `Your requested Verith data export is available through a private link for ${expiry}.`,
    eyebrow: 'Privacy request',
    title: 'Your data export is ready to download',
    intro:
      'Verith finished preparing the account data export you requested. The download link is private, time-limited, and intended only for the account owner.',
    productUrl: input.productUrl,
    action: { label: 'Download my export', url: input.actionUrl },
    details: [
      { label: 'Export reference', value: input.exportReference },
      { label: 'Download window', value: expiry },
      { label: 'Link handling', value: 'Private and time-limited' },
    ],
    sections: [
      {
        heading: 'Before downloading',
        bullets: [
          'Use a trusted device and network that you control.',
          'Store the downloaded archive in a protected location.',
          'Do not forward the download address or upload the archive to a public service.',
          'Delete copies you no longer need after reviewing the export.',
        ],
      },
      {
        heading: 'What the archive represents',
        paragraphs: [
          'The export reflects data available for the request when processing occurred. It may not include data already removed under retention, security, or deletion policies.',
        ],
        tone: 'notice',
      },
      {
        heading: 'If you did not request this export',
        paragraphs: [
          'Do not use or forward the download link. Secure your Verith password and the email account connected to Verith, then review account security settings.',
        ],
        tone: 'warning',
      },
    ],
    footerNote:
      'You received this essential privacy message because a Verith account data export was requested for this address.',
  });
}
