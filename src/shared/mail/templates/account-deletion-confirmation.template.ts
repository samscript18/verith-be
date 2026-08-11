import {
  renderMailLayout,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface AccountDeletionConfirmationTemplateInput {
  effectiveDate: string;
  productUrl: string;
  cancellationUrl?: string;
}

export function renderAccountDeletionConfirmationTemplate(
  input: AccountDeletionConfirmationTemplateInput,
): RenderedMailTemplate {
  return renderMailLayout({
    subject: 'Your Verith account deletion request is confirmed',
    preheader:
      'Review the deletion timeline, access impact, and any cancellation option available for your Verith account.',
    eyebrow: 'Privacy request',
    title: 'Your account deletion request is confirmed',
    intro:
      'Verith recorded a request to delete the account associated with this email address. Review the timeline and access consequences below so you know what happens next.',
    productUrl: input.productUrl,
    ...(input.cancellationUrl
      ? {
          action: {
            label: 'Review deletion request',
            url: input.cancellationUrl,
          },
        }
      : {}),
    details: [
      { label: 'Request', value: 'Account deletion' },
      { label: 'Scheduled effective date', value: input.effectiveDate },
      {
        label: 'Account access',
        value: 'Restricted according to the deletion workflow',
      },
    ],
    sections: [
      {
        heading: 'What happens next',
        bullets: [
          'Account access may be restricted while the deletion request is pending.',
          'Eligible account data is removed or anonymized according to Verith retention and legal obligations.',
          'Some security, audit, or legal records may be retained only for the period required by applicable policy.',
          'Deleted account data may not be recoverable after processing is complete.',
        ],
      },
      {
        heading: 'If you want to keep the account',
        paragraphs: [
          input.cancellationUrl
            ? 'Use the review action before the scheduled effective date and follow the authenticated cancellation steps shown by Verith. Availability depends on the current deletion state.'
            : 'Open Verith before the scheduled effective date to review whether an authenticated cancellation option is still available. Availability depends on the current deletion state.',
        ],
        tone: 'notice',
      },
      {
        heading: 'If you did not request deletion',
        paragraphs: [
          'Treat this as urgent account activity. Secure the email account connected to Verith, start a fresh password reset, and review the deletion request only from the official Verith address.',
        ],
        tone: 'warning',
      },
    ],
    footerNote:
      'You received this essential privacy and account message because a deletion request was recorded for a Verith account associated with this address.',
  });
}
