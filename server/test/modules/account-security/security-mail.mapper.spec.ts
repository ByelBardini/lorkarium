import { describe, expect, it } from 'vitest';
import {
  emailChangedMail,
  emailChangeRequestedMail,
  emailConfirmationMail,
  passwordChangedMail,
  twoFactorChangedMail,
  type MailOrigin,
  type MailRecipient,
} from '../../../src/modules/account-security/security-mail.mapper';

const PUBLIC_URL = 'https://mesa.example.com';
// 03:14 in Brasília (UTC−3).
const AT = new Date('2026-10-24T06:14:00Z');
const CHROME_ON_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const ANA: MailRecipient = { to: 'ana@mesa.com', name: 'Ana', username: 'ana' };
const ORIGIN: MailOrigin = { at: AT, userAgent: CHROME_ON_WINDOWS };
const LINK = 'https://mesa.example.com/account/email/confirm#token=t1';

describe('twoFactorChangedMail', () => {
  const on = twoFactorChangedMail({
    person: ANA,
    origin: ORIGIN,
    enabled: true,
    publicUrl: PUBLIC_URL,
  });
  const off = twoFactorChangedMail({
    person: ANA,
    origin: ORIGIN,
    enabled: false,
    publicUrl: PUBLIC_URL,
  });

  it('turned on: goes to the account, says it got safer and names the @', () => {
    expect(on.to).toBe('ana@mesa.com');
    expect(on.subject).toBe('Verificação em duas etapas ligada');
    expect(on.text).toContain('Sua conta ficou mais protegida');
    expect(on.text).toContain('Oi, Ana! A verificação em duas etapas está ligada na conta @ana.');
  });

  it('says when in Brasília time and the device the request came from', () => {
    expect(on.text).toContain('Quando: 24 de outubro de 2026 às 03:14 (horário de Brasília)');
    expect(on.text).toContain('De onde: Chrome no Windows');
  });

  it('turned on: the ok tone and the button to the account security', () => {
    expect(on.text).toContain('Ver a segurança da conta: https://mesa.example.com/account');
    expect(on.html).toContain('icon-shield-ok.png');
  });

  it('turned off: the alert tone, the codes are gone and the warning sends to Minha conta', () => {
    expect(off.subject).toBe('Verificação em duas etapas desligada');
    expect(off.html).toContain('icon-shield-off-alert.png');
    expect(off.text).toContain('Os códigos de recuperação antigos não valem mais.');
    expect(off.text).toContain('Ligar de novo: https://mesa.example.com/account');
    expect(off.text).toContain('Troque a senha agora em Minha conta');
  });

  it('without a user agent the device is "Navegador desconhecido"', () => {
    const origin = { at: AT, userAgent: null };
    const mail = twoFactorChangedMail({
      person: ANA,
      origin,
      enabled: true,
      publicUrl: PUBLIC_URL,
    });
    expect(mail.text).toContain('De onde: Navegador desconhecido');
  });
});

describe('emailConfirmationMail', () => {
  const mail = emailConfirmationMail({
    person: { to: 'bia@novo.com', name: 'Ana', username: 'ana' },
    link: LINK,
    publicUrl: PUBLIC_URL,
  });

  it('goes to the new address, greeting the account and naming its @', () => {
    expect(mail.to).toBe('bia@novo.com');
    expect(mail.subject).toBe('Confirme seu novo e-mail no Lorkarium');
    expect(mail.text).toContain('Confirme que este e-mail é seu');
    expect(mail.text).toContain(
      'Oi, Ana! Pediram para usar este endereço na conta @ana do Lorkarium.',
    );
    expect(mail.text).toContain('Até você confirmar, a conta continua usando o e-mail antigo.');
  });

  it('the button and the fallback carry the same link, with the 30-minute rule', () => {
    expect(mail.html).toContain(`<a href="${LINK}"`);
    expect(mail.html).toContain(`>${LINK}</a>`);
    expect(mail.text).toContain(`Confirmar novo e-mail: ${LINK}`);
    expect(mail.text).toContain('O link vale 30 minutos e só funciona uma vez.');
  });

  it('the footer says why it arrived and that ignoring changes nothing', () => {
    expect(mail.text).toContain(
      'Você recebeu porque este endereço foi informado numa troca de e-mail. Se não foi você, ignore: nada muda na conta.',
    );
  });
});

const RECOVER = 'https://mesa.example.com/account/recover#token=r1';

describe('passwordChangedMail', () => {
  const mail = passwordChangedMail({
    person: ANA,
    origin: ORIGIN,
    recoveryLink: RECOVER,
    publicUrl: PUBLIC_URL,
  });

  it('says the other devices were signed out, with when and from where', () => {
    expect(mail.subject).toBe('Sua senha do Lorkarium foi trocada');
    expect(mail.text).toContain('Por segurança, desconectamos todos os outros aparelhos.');
    expect(mail.text).toContain('Quando: 24 de outubro de 2026 às 03:14 (horário de Brasília)');
  });

  it('the "Não fui eu" button carries the recovery link and the warning its 7 days', () => {
    expect(mail.text).toContain(`Não fui eu, recuperar a conta: ${RECOVER}`);
    expect(mail.text).toContain('em até 7 dias');
    expect(mail.html).toContain('icon-lock-dark.png');
  });
});

describe('emailChangeRequestedMail', () => {
  it('names only the masked new address and offers to cancel, in the alert tone', () => {
    const mail = emailChangeRequestedMail({
      person: ANA,
      origin: ORIGIN,
      maskedNewEmail: 'b*****@x.com',
      recoveryLink: RECOVER,
      publicUrl: PUBLIC_URL,
    });
    expect(mail.text).toContain('Novo e-mail: b*****@x.com');
    expect(mail.text).toContain(`Não fui eu, cancelar a troca: ${RECOVER}`);
    expect(mail.html).toContain('icon-mail-swap-alert.png');
  });
});

describe('emailChangedMail', () => {
  const mail = emailChangedMail({
    person: ANA,
    origin: ORIGIN,
    maskedNewEmail: 'b*****@x.com',
    recoveryLink: RECOVER,
    publicUrl: PUBLIC_URL,
  });

  it('says this is the last notice to this address, with the way back', () => {
    expect(mail.text).toContain(
      'O e-mail da conta @ana agora é b*****@x.com. Este é o último aviso que mandamos para cá.',
    );
    expect(mail.text).toContain(`Não fui eu, recuperar a conta: ${RECOVER}`);
  });

  it('escapes values in the HTML', () => {
    const tricky = emailChangedMail({
      person: ANA,
      origin: ORIGIN,
      maskedNewEmail: '<b>@x.com',
      recoveryLink: RECOVER,
      publicUrl: PUBLIC_URL,
    });
    expect(tricky.html).toContain('&lt;b&gt;@x.com');
    expect(tricky.html).not.toContain('<b>@x.com');
  });
});
