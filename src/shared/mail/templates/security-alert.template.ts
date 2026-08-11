import {
  metadataValue,
  renderMailLayout,
  type MailTemplateDetail,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface SecurityAlertTemplateInput {
  subject: string;
  message: string;
  productUrl: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export function renderSecurityAlertTemplate(
  input: SecurityAlertTemplateInput,
): RenderedMailTemplate {
  const alertKind = metadataValue(input.metadata, 'securityAlertKind');
  const passwordResetCompleted = alertKind === 'PASSWORD_RESET';
  const details: MailTemplateDetail[] = [
    {
      label: 'Security event',
      value: passwordResetCompleted
        ? 'Password reset completed'
        : 'Account security activity',
    },
    ...(passwordResetCompleted
      ? [
          { label: 'Session impact', value: 'All existing sessions revoked' },
          { label: 'Next sign-in', value: 'New password required' },
        ]
      : []),
  ];

  return renderMailLayout({
    subject: passwordResetCompleted
      ? 'Your Verith password was reset'
      : input.subject,
    preheader: passwordResetCompleted
      ? 'Your password was reset and every existing Verith session was revoked.'
      : 'Review recent security activity associated with your Verith account.',
    eyebrow: 'Essential security notice',
    title: passwordResetCompleted
      ? 'Your password reset is complete'
      : 'Review this account security alert',
    intro: passwordResetCompleted
      ? 'This message confirms that a password reset was completed for your Verith account. Every existing session was revoked, so each trusted device must sign in again with the new password.'
      : 'Verith recorded security-sensitive activity associated with your account. Review the information below and act promptly if you do not recognize it.',
    productUrl: input.productUrl,
    action: {
      label: passwordResetCompleted ? 'Secure my account' : 'Review security',
      url:
        input.actionUrl ??
        (passwordResetCompleted
          ? '/forgot-password'
          : '/app/settings/security'),
    },
    details,
    sections: [
      {
        heading: 'Recorded activity',
        paragraphs: [input.message],
      },
      {
        heading: passwordResetCompleted
          ? 'If you reset the password'
          : 'If you recognize this activity',
        paragraphs: [
          passwordResetCompleted
            ? 'No further action is required. Sign in again with the new password only on devices you trust.'
            : 'No immediate action is required. You can still review security settings and active sessions from your Verith account.',
        ],
      },
      {
        heading: 'If you do not recognize this activity',
        bullets: [
          'Start a fresh password reset from the official Verith address.',
          'Secure the email account connected to Verith and review its sign-in activity.',
          'Use a unique replacement password between 12 and 128 characters.',
          'Review Verith security settings and revoke any session you do not recognize.',
        ],
        tone: 'warning',
      },
      {
        heading: 'Security reminder',
        paragraphs: [
          'Verith will never ask you to reply with your password, send a password through email, or forward a private reset link to another person.',
        ],
        tone: 'notice',
      },
    ],
    footerNote:
      'You received this essential security notice because security-sensitive activity occurred on your Verith account. Security notices cannot be disabled through normal notification preferences.',
  });
}
