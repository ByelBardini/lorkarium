import {
  iconUrl,
  MAIL_COLORS as C,
  MAIL_FONTS as F,
  MAIL_FONTS_HREF,
  MAIL_TONES,
  markUrl,
  type TonePalette,
} from './mail-palette';
import type { MailButton, MailDetail, MailSpec, MailWarning } from './mail-spec';
import { MAIL_BRAND_LINE } from './mail-text';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const FALLBACK_HINT = 'O botão não funcionou? Copie e cole no navegador:';
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/** Escapes text for an HTML body or a double-quoted attribute.
 *
 *  Example: `escapeHtml('Ana & "Bia"') // 'Ana &amp; &quot;Bia&quot;'` */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** The e-mail HTML of the mock: nested presentation tables, inline styles, no SVG, no script.
 *
 *  Example: `renderMailHtml(spec, 'https://mesa.example.com').startsWith('<!doctype html>') // true` */
export function renderMailHtml(spec: MailSpec, publicUrl: string): string {
  const palette = MAIL_TONES[spec.tone];
  const card = [
    bandRow(publicUrl),
    accentRow(palette),
    `<tr><td style="padding:40px 40px 12px;">${bodyBlocks(spec, publicUrl).join('')}</td></tr>`,
    footerRow(spec.footer),
  ].join('');
  return `${documentHead(spec.subject)}<body style="margin:0;padding:0;background:${C.page};">${preheader(spec.preheader)}<table ${TABLE} width="100%" bgcolor="${C.page}" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;"><table ${TABLE} width="600" bgcolor="${C.body}" style="width:100%;max-width:600px;background:${C.body};border-radius:12px;overflow:hidden;">${card}</table></td></tr></table></body></html>`;
}

function documentHead(subject: string): string {
  return [
    '<!doctype html>',
    '<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light only">',
    '<meta name="supported-color-schemes" content="light only">',
    `<title>${escapeHtml(subject)}</title>`,
    `<link rel="stylesheet" href="${escapeHtml(MAIL_FONTS_HREF)}">`,
    '</head>',
  ].join('');
}

function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(text)}</div>`;
}

function bandRow(publicUrl: string): string {
  const mark = `<img src="${escapeHtml(markUrl(publicUrl))}" width="30" height="30" alt="" style="display:block;border:0;">`;
  const brand = `<td style="padding-left:12px;font-family:${F.brand};font-size:15px;font-weight:600;letter-spacing:0.3em;color:${C.bandText};">LORKARIUM</td>`;
  return `<tr><td bgcolor="${C.band}" style="padding:22px 40px;background:${C.band};"><table ${TABLE}><tr><td width="30">${mark}</td>${brand}</tr></table></td></tr>`;
}

function accentRow(palette: TonePalette): string {
  return `<tr><td style="height:3px;line-height:3px;font-size:0;background:${palette.accent};">&nbsp;</td></tr>`;
}

function bodyBlocks(spec: MailSpec, publicUrl: string): readonly string[] {
  const palette = MAIL_TONES[spec.tone];
  const blocks = [
    iconBlock(iconUrl(publicUrl, spec.icon, spec.tone), palette),
    `<h1 style="margin:0;font-family:${F.display};font-weight:600;font-size:32px;line-height:1.15;color:${C.heading};">${escapeHtml(spec.title)}</h1>`,
    ...spec.paragraphs.map(paragraphBlock),
    spec.details && spec.details.length > 0 ? detailsBlock(spec.details) : null,
    spec.button ? buttonBlock(spec.button, palette) : null,
    spec.note ? noteBlock(spec.note) : null,
    spec.warning ? warningBlock(spec.warning) : null,
    spec.fallbackLink && spec.button ? fallbackBlock(spec.button.href) : null,
  ];
  return blocks.filter((block): block is string => block !== null).map(spaced);
}

function spaced(block: string): string {
  return `<div style="margin:0 0 20px;">${block}</div>`;
}

function iconBlock(src: string, palette: TonePalette): string {
  return `<table ${TABLE}><tr><td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:50%;background:${palette.iconBg};"><img src="${escapeHtml(src)}" width="24" height="24" alt="" style="display:block;border:0;"></td></tr></table>`;
}

function paragraphBlock(line: string): string {
  return `<p style="margin:0;font-family:${F.body};font-size:16px;line-height:1.6;color:${C.text};">${escapeHtml(line)}</p>`;
}

function detailsBlock(details: readonly MailDetail[]): string {
  const rows = details.map((detail, index) => detailRow(detail, index === 0)).join('');
  return `<table ${TABLE} width="100%" bgcolor="${C.detailsBg}" style="background:${C.detailsBg};border:1px solid ${C.detailsBorder};border-radius:10px;"><tr><td style="padding:6px 18px;"><table ${TABLE} width="100%">${rows}</table></td></tr></table>`;
}

function detailRow(detail: MailDetail, first: boolean): string {
  const rule = first ? '' : `border-top:1px solid ${C.detailsRule};`;
  const cell = `padding:10px 0;${rule}font-family:${F.body};font-size:14px;`;
  return `<tr><td width="110" valign="top" style="${cell}width:110px;color:${C.key};">${escapeHtml(detail.label)}</td><td valign="top" style="${cell}color:${C.heading};font-weight:600;">${escapeHtml(detail.value)}</td></tr>`;
}

function buttonBlock(button: MailButton, palette: TonePalette): string {
  const link = `<a href="${escapeHtml(button.href)}" style="display:inline-block;padding:15px 28px;font-family:${F.body};font-size:15px;font-weight:700;letter-spacing:0.01em;text-decoration:none;color:${palette.buttonFg};">${escapeHtml(button.label)}</a>`;
  return `<table ${TABLE}><tr><td bgcolor="${palette.buttonBg}" style="border-radius:8px;background:${palette.buttonBg};">${link}</td></tr></table>`;
}

function noteBlock(note: string): string {
  return `<p style="margin:0;font-family:${F.body};font-size:14px;line-height:1.55;color:${C.muted};">${escapeHtml(note)}</p>`;
}

function warningBlock(warning: MailWarning): string {
  const text = `<strong style="font-weight:700">${escapeHtml(warning.title)}</strong> ${escapeHtml(warning.text)}`;
  return `<table ${TABLE} width="100%"><tr><td style="padding:14px 16px;border-radius:10px;background:${C.warningBg};border:1px solid ${C.warningBorder};font-family:${F.body};font-size:14px;line-height:1.55;color:${C.warningText};">${text}</td></tr></table>`;
}

function fallbackBlock(href: string): string {
  const hint = `<p style="margin:0 0 6px;font-family:${F.body};font-size:12px;color:${C.key};">${FALLBACK_HINT}</p>`;
  const url = `<p style="margin:0;font-family:${F.mono};font-size:12px;word-break:break-all;"><a href="${escapeHtml(href)}" style="color:${C.link};">${escapeHtml(href)}</a></p>`;
  return hint + url;
}

function footerRow(footer: readonly string[]): string {
  const lines = [...footer, MAIL_BRAND_LINE]
    .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`)
    .join('');
  return `<tr><td bgcolor="${C.page}" style="padding:22px 40px 20px;background:${C.page};font-family:${F.body};font-size:12px;line-height:1.55;color:${C.key};">${lines}</td></tr>`;
}
