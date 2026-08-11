import {
  renderMailLayout,
  type RenderedMailTemplate,
} from './mail-layout.template';

export interface GenericNotificationTemplateInput {
  subject: string;
  message: string;
  productUrl: string;
  actionUrl?: string;
  type?: string;
}

export function renderGenericNotificationTemplate(
  input: GenericNotificationTemplateInput,
): RenderedMailTemplate {
  return renderMailLayout({
    subject: input.subject,
    preheader:
      input.message.length > 160
        ? `${input.message.slice(0, 157)}...`
        : input.message,
    eyebrow: 'Verith update',
    title: input.subject,
    intro: input.message,
    productUrl: input.productUrl,
    ...(input.actionUrl
      ? { action: { label: 'View in Verith', url: input.actionUrl } }
      : {}),
    ...(input.type
      ? {
          details: [
            { label: 'Notification category', value: readableType(input.type) },
          ],
        }
      : {}),
    sections: [
      {
        heading: 'What to do next',
        paragraphs: [
          input.actionUrl
            ? 'Open Verith to review the complete context and any actions available to your account.'
            : 'Sign in to Verith to review your current account activity and any related information.',
        ],
      },
      {
        heading: 'Keep the context with the update',
        paragraphs: [
          'Email provides a concise notification only. Verith remains the source of truth for the complete status, evidence relationships, limitations, privacy controls, and available actions.',
        ],
        tone: 'notice',
      },
      {
        heading: 'Why you received this',
        paragraphs: [
          'This message relates to activity or a notification preference associated with your Verith account. Eligible product email choices can be changed from notification settings; essential security messages may still be delivered.',
        ],
      },
    ],
    footerNote:
      'This is a transactional or preference-based Verith notification. Eligible email notification choices can be changed in Verith settings.',
  });
}

function readableType(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
