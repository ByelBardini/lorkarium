import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mailSamples } from '../../../src/modules/account-security/mail-samples.mapper';

const PUBLIC_URL = 'https://mesa.example.com';
const TO = 'preview@lorkarium.dev';
const EMAIL_IMAGES = fileURLToPath(new URL('../../../../client/public/email/', import.meta.url));

const catalog = mailSamples(TO, PUBLIC_URL, new Date('2026-10-24T16:37:00Z'));

function attributeValues(html: string, attribute: 'href' | 'src'): string[] {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

describe('mailSamples', () => {
  it('lists every system e-mail by a stable id and a name, in the catalog order', () => {
    expect(catalog.map((sample) => [sample.id, sample.name])).toEqual([
      ['email-confirmation', 'Confirmação do novo e-mail'],
      ['email-change-requested', 'Pedido de troca de e-mail'],
      ['email-changed', 'E-mail trocado'],
      ['password-changed', 'Senha trocada'],
      ['two-factor-on', '2FA ligado'],
      ['two-factor-off', '2FA desligado'],
      ['invitation', 'Convite'],
      ['password-link', 'Link de nova senha'],
      ['access-suspended', 'Acesso suspenso'],
      ['access-restored', 'Acesso reativado'],
      ['promoted-to-admin', 'Agora é admin'],
    ]);
  });

  it('addresses every sample to the given inbox', () => {
    expect(new Set(catalog.map((sample) => sample.message.to))).toEqual(new Set([TO]));
  });

  describe.each(catalog.map((sample) => [sample.name, sample.message] as const))(
    '%s',
    (_, mail) => {
      it('has a subject and a hidden preheader', () => {
        expect(mail.subject.trim()).not.toBe('');
        expect(mail.html).toMatch(/<div style="display:none;[^>]*>[^<]+<\/div>/);
      });

      it('carries no svg nor a leaked undefined, null, NaN or [object', () => {
        expect(mail.html).not.toContain('<svg');
        expect(`${mail.html}${mail.text}`).not.toMatch(/undefined|\bnull\b|NaN|\[object/);
      });

      it('every link and image is absolute on the public url', () => {
        const urls = [...attributeValues(mail.html, 'href'), ...attributeValues(mail.html, 'src')];
        const own = urls.filter((url) => !url.startsWith('https://fonts.googleapis.com/'));
        for (const url of own) expect(url.startsWith(PUBLIC_URL)).toBe(true);
      });

      it('every image exists in client/public/email', () => {
        for (const src of attributeValues(mail.html, 'src')) {
          const file = src.slice(`${PUBLIC_URL}/email/`.length);
          expect(existsSync(`${EMAIL_IMAGES}${file}`), src).toBe(true);
        }
      });

      it('the plain text carries every link of the html', () => {
        const links = attributeValues(mail.html, 'href').filter((url) =>
          url.startsWith(PUBLIC_URL),
        );
        for (const href of links) expect(mail.text).toContain(href.replaceAll('&amp;', '&'));
      });
    },
  );
});
