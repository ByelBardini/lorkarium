import { describe, expect, it } from 'vitest';
import {
  emailChangedMail,
  emailChangeRequestedMail,
  emailConfirmationMail,
  passwordChangedMail,
  twoFactorChangedMail,
} from '../../../src/modules/account-security/security-mail.mapper';

// 15:30 in São Paulo (UTC−3).
const AT = new Date('2026-10-14T18:30:00Z');
const LINK = 'https://mesa.example.com/account/email/confirm#token=segredo-do-link';

describe('security notices', () => {
  it('"Sua senha foi trocada" says when, in São Paulo time, and the "if it was not you"', () => {
    const mail = passwordChangedMail('ana@mesa.com', AT);
    expect(mail.to).toBe('ana@mesa.com');
    expect(mail.subject).toBe('Sua senha foi trocada');
    expect(mail.text).toContain('14 de outubro de 2026');
    expect(mail.text).toContain('15:30');
    expect(mail.text).toContain('Se não foi você');
    expect(mail.html).toContain('<p>Se não foi você');
  });

  it.each([
    [true, 'Verificação em duas etapas ligada'],
    [false, 'Verificação em duas etapas desligada'],
  ])('2FA turned on=%s has the subject "%s"', (enabled, subject) => {
    expect(twoFactorChangedMail('ana@mesa.com', enabled, AT).subject).toBe(subject);
  });

  it('the request notice to the old address names only the masked new one', () => {
    const mail = emailChangeRequestedMail('ana@mesa.com', 'b*****@x.com', AT);
    expect(mail.text).toContain('b*****@x.com');
    expect(mail.text).toContain('Se não foi você');
  });

  it('the done notice to the old address says it no longer signs in', () => {
    const mail = emailChangedMail('ana@mesa.com', 'b*****@x.com', AT);
    expect(mail.subject).toBe('O e-mail da sua conta foi trocado');
    expect(mail.text).toContain('não entra mais');
  });

  it('every notice has plain text and HTML, and never a token', () => {
    const notices = [
      passwordChangedMail('ana@mesa.com', AT),
      twoFactorChangedMail('ana@mesa.com', true, AT),
      emailChangeRequestedMail('ana@mesa.com', 'b*****@x.com', AT),
      emailChangedMail('ana@mesa.com', 'b*****@x.com', AT),
    ];
    for (const mail of notices) {
      expect(mail.text.length).toBeGreaterThan(20);
      expect(mail.html).toMatch(/^<p>/);
      expect(`${mail.text}${mail.html}`).not.toMatch(/token/i);
    }
  });

  it('values are escaped in the HTML', () => {
    const mail = emailChangedMail('ana@mesa.com', '<b>@x.com', AT);
    expect(mail.html).toContain('&lt;b&gt;@x.com');
    expect(mail.html).not.toContain('<b>@x.com');
  });
});

describe('emailConfirmationMail', () => {
  it('carries the link in the text and as the HTML anchor, with the 30-minute rule', () => {
    const mail = emailConfirmationMail('bia@novo.com', LINK);
    expect(mail.to).toBe('bia@novo.com');
    expect(mail.subject).toBe('Confirme seu novo e-mail');
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain(`<a href="${LINK}">Confirmar novo e-mail</a>`);
    expect(mail.text).toContain('30 minutos');
  });
});
