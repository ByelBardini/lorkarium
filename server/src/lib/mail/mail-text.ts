import type { MailSpec } from './mail-spec';

export const MAIL_BRAND_LINE = 'Lorkarium · mesa virtual de RPG';

/** The plain-text twin of the HTML: same blocks, one blank line between them, the button as "label: url".
 *
 *  Example: `renderMailText(spec).startsWith(spec.title) // true` */
export function renderMailText(spec: MailSpec): string {
  const sections = [
    spec.title,
    ...spec.paragraphs,
    ...(spec.details ?? []).map((detail) => `${detail.label}: ${detail.value}`),
    spec.button ? `${spec.button.label}: ${spec.button.href}` : null,
    spec.warning ? `${spec.warning.title} ${spec.warning.text}` : null,
    spec.note ?? null,
    [...spec.footer, MAIL_BRAND_LINE].join('\n'),
  ];
  return sections.filter((section): section is string => section !== null).join('\n\n');
}
