import { renderMailHtml } from './mail-html';
import type { MailSpec, RenderedMail } from './mail-spec';
import { renderMailText } from './mail-text';

const ABSOLUTE_URL = /^https?:\/\/\S+$/;

/** One spec, the two bodies of the e-mail. Images are served from `publicUrl` (`APP_PUBLIC_URL`).
 *
 *  Example: `renderMail(spec, 'https://mesa.example.com') // { html: '<!doctype html>…', text: 'Título…' }` */
export function renderMail(spec: MailSpec, publicUrl: string): RenderedMail {
  if (spec.button) requireAbsolute(spec.button.href);
  return { html: renderMailHtml(spec, publicUrl), text: renderMailText(spec) };
}

function requireAbsolute(href: string): void {
  if (ABSOLUTE_URL.test(href)) return;
  throw new Error(
    `Mail button href ${JSON.stringify(href)} is not usable: expected uma URL absoluta (https://…)`,
  );
}
