import {
  renderMailLayout,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface PasswordChangedTemplateInput {
  message: string;
  productUrl: string;
}

export function renderPasswordChangedTemplate(
  input: PasswordChangedTemplateInput,
): RenderedMailTemplate {
  return renderMailLayout({
    subject: 'Your Verith password was changed',
    preheader:
      'Your password changed and every existing Verith session was revoked.',
    eyebrow: 'Essential security notice',
    title: 'Your Verith password was changed',
    intro:
      'This message confirms that the password for your Verith account was changed. Every existing session, including the session used to make the change, was revoked as a security precaution.',
    productUrl: input.productUrl,
    action: { label: 'Secure my account', url: '/forgot-password' },
    details: [
      { label: 'Security event', value: 'Password changed' },
      { label: 'Session impact', value: 'All existing sessions revoked' },
      { label: 'Next sign-in', value: 'New password required' },
    ],
    sections: [
      {
        heading: 'If you made this change',
        paragraphs: [
          input.message,
          'No further action is required. Sign in again with the new password on each device you still trust.',
        ],
      },
      {
        heading: 'If you did not make this change',
        bullets: [
          'Use the secure-account action above to start a new password reset immediately.',
          'Secure the email account connected to Verith, including its password and multi-factor authentication settings.',
          'Do not reuse a password from another service when choosing the replacement.',
          'After regaining access, review your Verith security settings and active sessions.',
        ],
        tone: 'warning',
      },
      {
        heading: 'Why every session was revoked',
        paragraphs: [
          'Session revocation prevents previously signed-in browsers or devices from continuing to use the account after a credential change. Every device must authenticate again.',
        ],
        tone: 'notice',
      },
      {
        heading: 'Security reminder',
        paragraphs: [
          'Verith will never ask you to reply with your password. Access account recovery from the official Verith address and never forward password-reset links.',
        ],
      },
    ],
    footerNote:
      'You received this essential security notice because the password on your Verith account changed. Security notices cannot be disabled through normal notification preferences.',
  });
}
