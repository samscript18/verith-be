import {
  formatExpiry,
  renderMailLayout,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface VerifyEmailTemplateInput {
  actionUrl: string;
  expiresInMinutes: number;
  productUrl: string;
}

export function renderVerifyEmailTemplate(
  input: VerifyEmailTemplateInput,
): RenderedMailTemplate {
  const expiry = formatExpiry(input.expiresInMinutes);

  return renderMailLayout({
    subject: 'Confirm your email to activate Verith',
    preheader: `Finish setting up your Verith account with a single-use link that expires in ${expiry}.`,
    eyebrow: 'Account setup',
    title: 'Confirm your email to activate Verith',
    intro:
      'A Verith account was created using this email address. Confirm that the address belongs to you to finish account setup and protect access to your investigation workspace.',
    productUrl: input.productUrl,
    action: { label: 'Verify my email', url: input.actionUrl },
    details: [
      { label: 'Requested action', value: 'Email address verification' },
      { label: 'Link validity', value: `${expiry} from when it was issued` },
      { label: 'Link use', value: 'Single-use and private' },
      {
        label: 'Account state',
        value: 'Pending until this address is confirmed',
      },
    ],
    sections: [
      {
        heading: 'What happens after confirmation',
        bullets: [
          'Your email address is marked as verified and your Verith account is activated.',
          'You can sign in and open the investigation workspace.',
          'Private investigations and reports remain tied to your authenticated account.',
          'Account, security, privacy, and notification choices remain available from settings.',
        ],
      },
      {
        heading: 'About this verification link',
        paragraphs: [
          `The link expires after ${expiry} and can be used only once. If you request another verification email, the newer link replaces earlier unused verification links.`,
          'If the link has expired, return to Verith and request a fresh verification email rather than reusing or forwarding the old one.',
        ],
        tone: 'notice',
      },
      {
        heading: 'If you did not create this account',
        paragraphs: [
          'Do not use or forward the link. You can safely ignore this message and the account will remain unverified.',
          'Verith will never ask you to reply with your password or send this private verification link to another person.',
        ],
        tone: 'warning',
      },
      {
        heading: 'Why Verith verifies email addresses',
        paragraphs: [
          'Email confirmation helps prevent another person from registering your address and protects access to account recovery, private investigations, and essential security notices.',
        ],
      },
    ],
    footerNote:
      'You received this transactional email because someone created a Verith account with this address. This message is required to complete account setup.',
  });
}
