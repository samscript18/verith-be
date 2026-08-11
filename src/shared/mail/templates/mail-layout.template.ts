export interface RenderedMailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface MailTemplateAction {
  label: string;
  url: string;
}

export interface MailTemplateDetail {
  label: string;
  value: string;
}

export interface MailTemplateSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  tone?: 'default' | 'notice' | 'warning';
}

export interface MailLayoutInput {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  productUrl: string;
  action?: MailTemplateAction;
  details?: MailTemplateDetail[];
  sections: MailTemplateSection[];
  footerNote?: string;
}

const brandLine =
  'Evidence intelligence that keeps sources, inference, uncertainty, and limitations open to human review.';

export function renderMailLayout(input: MailLayoutInput): RenderedMailTemplate {
  const productUrl = resolveTrustedUrl(input.productUrl, input.productUrl);
  const privacyUrl = resolveTrustedUrl(input.productUrl, '/privacy');
  const termsUrl = resolveTrustedUrl(input.productUrl, '/terms');
  const action = input.action
    ? {
        label: input.action.label,
        url: resolveTrustedUrl(input.productUrl, input.action.url),
      }
    : undefined;
  const details = input.details?.filter(
    (detail) => detail.label.trim() && detail.value.trim(),
  );
  const year = new Date().getUTCFullYear();
  const text = renderText({
    ...input,
    productUrl,
    ...(action ? { action } : {}),
    ...(details?.length ? { details } : {}),
    privacyUrl,
    termsUrl,
    year,
  });
  const html = renderHtml({
    ...input,
    productUrl,
    ...(action ? { action } : {}),
    ...(details?.length ? { details } : {}),
    privacyUrl,
    termsUrl,
    year,
  });

  return { subject: input.subject, text, html };
}

export function formatExpiry(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'a limited time';
  const wholeMinutes = Math.round(minutes);
  if (wholeMinutes < 60) {
    return `${wholeMinutes} ${wholeMinutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (wholeMinutes % 60 === 0) {
    const hours = wholeMinutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${wholeMinutes} minutes`;
}

export function metadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

interface ResolvedMailLayoutInput extends MailLayoutInput {
  privacyUrl: string;
  termsUrl: string;
  year: number;
}

function renderText(input: ResolvedMailLayoutInput): string {
  const lines = [
    'VERITH',
    'Evidence intelligence, explained clearly.',
    '',
    input.eyebrow.toUpperCase(),
    input.title,
    '',
    'Hello,',
    '',
    input.intro,
  ];

  if (input.details?.length) {
    lines.push('', 'DETAILS');
    for (const detail of input.details) {
      lines.push(`${detail.label}: ${detail.value}`);
    }
  }

  if (input.action) {
    lines.push(
      '',
      'NEXT STEP',
      `${input.action.label}: ${input.action.url}`,
      '',
      'If the link does not open, copy the complete address above and paste it into your browser. Do not forward a private action link to anyone else.',
    );
  }

  for (const section of input.sections) {
    lines.push('', section.heading.toUpperCase());
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph);
    for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`);
  }

  lines.push(
    '',
    'ABOUT VERITH',
    brandLine,
    '',
    input.footerNote ??
      'This is a transactional message about your Verith account or activity. Replies to this address may not be monitored.',
    '',
    `Open Verith: ${input.productUrl}`,
    `Privacy: ${input.privacyUrl}`,
    `Terms: ${input.termsUrl}`,
    '',
    `© ${input.year} Verith. Built to strengthen media and information literacy through evidence, transparency, and education.`,
  );

  return lines.join('\n');
}

function renderHtml(input: ResolvedMailLayoutInput): string {
  const actionHtml = input.action
    ? `
      <tr>
        <td style="padding: 6px 36px 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
            <tr>
              <td style="border-radius: 999px; background-color: #7c3aed; background-image: linear-gradient(135deg, #c084fc 0%, #6366f1 100%);">
                <a href="${escapeHtml(input.action.url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; min-width: 190px; padding: 15px 24px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 700; line-height: 18px; text-align: center; text-decoration: none;">${escapeHtml(input.action.label)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 36px 24px;">
          <p style="margin: 0 0 8px; color: #8f93a3; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px;">If the button does not open, copy and paste this complete address into your browser:</p>
          <p style="margin: 0; overflow-wrap: anywhere; word-break: break-word; color: #b8a9ff; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px;"><a href="${escapeHtml(input.action.url)}" target="_blank" rel="noopener noreferrer" style="color: #b8a9ff; text-decoration: underline;">${escapeHtml(input.action.url)}</a></p>
        </td>
      </tr>`
    : '';
  const detailsHtml = input.details?.length
    ? `
      <tr>
        <td style="padding: 4px 36px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate; border-spacing: 0; border: 1px solid #292c35; border-radius: 16px; background-color: #15171d;">
            <tr>
              <td colspan="2" style="padding: 18px 18px 8px; color: #c9cad1; font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">Message details</td>
            </tr>
            ${input.details
              .map(
                (detail, index) => `
            <tr>
              <td valign="top" style="width: 34%; padding: 11px 18px ${index === input.details!.length - 1 ? '18px' : '11px'}; border-top: ${index === 0 ? '0' : '1px solid #252831'}; color: #8f93a3; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px;">${escapeHtml(detail.label)}</td>
              <td valign="top" style="padding: 11px 18px ${index === input.details!.length - 1 ? '18px' : '11px'}; border-top: ${index === 0 ? '0' : '1px solid #252831'}; overflow-wrap: anywhere; word-break: break-word; color: #f4f1fb; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 600; line-height: 18px;">${escapeHtml(detail.value)}</td>
            </tr>`,
              )
              .join('')}
          </table>
        </td>
      </tr>`
    : '';
  const sectionsHtml = input.sections
    .map((section) => renderSection(section))
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>${escapeHtml(input.subject)}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .verith-shell { width: 100% !important; border-radius: 0 !important; }
        .verith-pad { padding-left: 22px !important; padding-right: 22px !important; }
        .verith-title { font-size: 30px !important; line-height: 34px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #08090a; color: #f7f5fb;">
    <div style="display: none; max-height: 0; max-width: 0; overflow: hidden; opacity: 0; color: transparent; line-height: 1px;">${escapeHtml(input.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse; background-color: #08090a;">
      <tr>
        <td align="center" style="padding: 28px 12px;">
          <table class="verith-shell" role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 620px; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid #252831; border-radius: 24px; background-color: #101116; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);">
            <tr>
              <td class="verith-pad" style="padding: 28px 36px 24px; border-bottom: 1px solid #252831;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                  <tr>
                    <td valign="middle" style="color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 17px; font-weight: 800; letter-spacing: -0.2px;">VERITH</td>
                    <td valign="middle" align="right" style="color: #8f93a3; font-family: Arial, Helvetica, sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;">Evidence intelligence</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="verith-pad" style="padding: 36px 36px 14px;">
                <p style="margin: 0 0 16px; color: #b8a9ff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase;">${escapeHtml(input.eyebrow)}</p>
                <h1 class="verith-title" style="margin: 0; max-width: 500px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 700; letter-spacing: -1.4px; line-height: 42px;">${escapeHtml(input.title)}</h1>
              </td>
            </tr>
            <tr>
              <td class="verith-pad" style="padding: 12px 36px 24px;">
                <p style="margin: 0 0 12px; color: #f4f1fb; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 24px;">Hello,</p>
                <p style="margin: 0; color: #b8bac5; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 25px;">${escapeWithLineBreaks(input.intro)}</p>
              </td>
            </tr>
            ${detailsHtml}
            ${actionHtml}
            ${sectionsHtml}
            <tr>
              <td class="verith-pad" style="padding: 26px 36px; border-top: 1px solid #252831; background-color: #0c0d11;">
                <p style="margin: 0 0 8px; color: #f4f1fb; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;">About Verith</p>
                <p style="margin: 0 0 18px; color: #8f93a3; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 19px;">${escapeHtml(brandLine)}</p>
                <p style="margin: 0 0 18px; color: #747886; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 18px;">${escapeHtml(input.footerNote ?? 'This is a transactional message about your Verith account or activity. Replies to this address may not be monitored.')}</p>
                <p style="margin: 0 0 14px; color: #8f93a3; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 18px;"><a href="${escapeHtml(input.productUrl)}" style="color: #b8a9ff; text-decoration: underline;">Open Verith</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escapeHtml(input.privacyUrl)}" style="color: #b8a9ff; text-decoration: underline;">Privacy</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escapeHtml(input.termsUrl)}" style="color: #b8a9ff; text-decoration: underline;">Terms</a></p>
                <p style="margin: 0; color: #626673; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 17px;">© ${input.year} Verith. Built to strengthen media and information literacy through evidence, transparency, and education.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderSection(section: MailTemplateSection): string {
  const palette =
    section.tone === 'warning'
      ? { background: '#1b1710', border: '#4d3a19', accent: '#f0bd66' }
      : section.tone === 'notice'
        ? { background: '#151322', border: '#35304d', accent: '#c4b5fd' }
        : { background: '#12141a', border: '#252831', accent: '#f4f1fb' };
  const paragraphs = (section.paragraphs ?? [])
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 12px; color: #b8bac5; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 21px;">${escapeWithLineBreaks(paragraph)}</p>`,
    )
    .join('');
  const bullets = section.bullets?.length
    ? `<ul style="margin: 4px 0 0; padding: 0 0 0 20px; color: #b8bac5; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 21px;">${section.bullets
        .map(
          (bullet) =>
            `<li style="margin: 0 0 7px; padding-left: 3px;">${escapeWithLineBreaks(bullet)}</li>`,
        )
        .join('')}</ul>`
    : '';

  return `
            <tr>
              <td class="verith-pad" style="padding: 0 36px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate; border-spacing: 0; border: 1px solid ${palette.border}; border-radius: 16px; background-color: ${palette.background};">
                  <tr>
                    <td style="padding: 20px 20px 8px; color: ${palette.accent}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;">${escapeHtml(section.heading)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 20px 10px;">${paragraphs}${bullets}</td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

function resolveTrustedUrl(productUrl: string, value: string): string {
  let base: URL;
  let resolved: URL;
  try {
    base = new URL(productUrl);
    resolved = new URL(value, base);
  } catch {
    throw new Error('Mail links require a valid frontend URL');
  }
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error('Mail links require an HTTP or HTTPS frontend URL');
  }
  if (!['http:', 'https:'].includes(resolved.protocol)) {
    throw new Error('Mail action links must use HTTP or HTTPS');
  }
  if (resolved.origin !== base.origin) {
    throw new Error(
      'Mail action links must use the configured frontend origin',
    );
  }
  return resolved.toString();
}

function escapeWithLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
