import {
  formatExpiry,
  renderMailLayout,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface PasswordResetTemplateInput {
  actionUrl: string;
  expiresInMinutes: number;
  productUrl: string;
}

export function renderPasswordResetTemplate(
  input: PasswordResetTemplateInput,
): RenderedMailTemplate {
  const expiry = formatExpiry(input.expiresInMinutes);

  return renderMailLayout({
    subject: 'Reset your Verith password',
    preheader: `Use this single-use link within ${expiry} to choose a new Verith password.`,
    eyebrow: 'Account security',
    title: 'Choose a new password for your Verith account',
    intro:
      'A password reset was requested for this email address. Your password has not changed. Use the secure, single-use link below only if you made this request.',
    productUrl: input.productUrl,
    action: { label: 'Set a new password', url: input.actionUrl },
    details: [
      { label: 'Requested action', value: 'Password reset' },
      { label: 'Link validity', value: `${expiry} from when it was issued` },
      { label: 'Link use', value: 'Single-use and private' },
      {
        label: 'Current password',
        value: 'Unchanged until the reset is completed',
      },
    ],
    sections: [
      {
        heading: 'Before you continue',
        bullets: [
          'Open the reset page using the button above or the complete fallback address.',
          'Choose a password between 12 and 128 characters that you do not reuse on another service.',
          'Complete the reset once; the link cannot be used again afterward.',
          'Sign in again on every device after the reset is complete.',
        ],
      },
      {
        heading: 'What the reset changes',
        paragraphs: [
          'After a successful reset, Verith revokes every existing account session. This protects the account if an older session or password was exposed.',
          'The reset link expires automatically after the validity window. Request a new reset from the Verith sign-in page if it is no longer valid.',
        ],
        tone: 'notice',
      },
      {
        heading: 'If you did not request this reset',
        paragraphs: [
          'Do not open, copy, or forward the reset link. This email alone does not change your password, so you can safely ignore it.',
          'If you are concerned about repeated reset emails, secure the email account connected to Verith and access Verith only from the address you normally use.',
        ],
        tone: 'warning',
      },
      {
        heading: 'Protect private action links',
        paragraphs: [
          'Anyone with a valid reset link may be able to choose a new password. Verith will never ask you to reply with your password or forward this link to another person.',
        ],
      },
    ],
    footerNote:
      'You received this essential security email because a password reset was requested for a Verith account associated with this address.',
  });
}
