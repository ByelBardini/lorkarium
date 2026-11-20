import { describe, expect, it } from 'vitest';
import {
  accountBannedMail,
  accountSuspendedForMail,
  contentRemovedMail,
  sanctionWarningMail,
  type SanctionMailInput,
} from '../../../src/modules/sanctions/sanction-mail.mapper';

const APP = 'https://mesa.example.com';
const SITE = 'https://lorkarium.example.com';
const CONTACT = 'contato@lorkarium.example.com';
const RULE_LINK = `${SITE}/uso/#2-respeito-%C3%A0s-pessoas`;

function input(overrides: Partial<SanctionMailInput> = {}): SanctionMailInput {
  return {
    person: { to: 'caio@mesa.com', name: 'Caio', username: 'caio' },
    rule: 'harassment',
    statement: 'Ameaçou um jogador real no chat da mesa Vharn.',
    until: null,
    publicUrl: APP,
    siteUrl: SITE,
    replyTo: CONTACT,
    ...overrides,
  };
}

describe('accountSuspendedForMail', () => {
  const mail = accountSuspendedForMail(input({ until: new Date('2026-11-25T15:00:00Z') }));

  it('goes to the account with the contact as Reply-To', () => {
    expect(mail).toMatchObject({ to: 'caio@mesa.com', replyTo: CONTACT });
    expect(mail.subject).toBe('Sua conta no Lorkarium foi suspensa');
  });

  it('carries the statement, the rule by its section and the end in Brasília', () => {
    expect(mail.text).toContain('Ameaçou um jogador real no chat da mesa Vharn.');
    expect(mail.text).toContain('Respeito às pessoas (§2 da Política de uso)');
    expect(mail.text).toContain('até 25/11/2026 às 12:00 (horário de Brasília)');
  });

  it('links the rule to its heading of the use policy, in the html and in the text', () => {
    expect(mail.html).toContain(`href="${RULE_LINK}"`);
    expect(mail.text).toContain(RULE_LINK);
  });

  it('tells how to appeal by answering the e-mail, reviewed by a person in 15 days', () => {
    expect(mail.text).toContain('Para contestar, responda a este e-mail');
    expect(mail.text).toContain('15 dias');
  });

  it('a suspension without an end says so', () => {
    const open = accountSuspendedForMail(input());
    expect(open.text).toContain('Prazo: sem prazo');
    expect(open.text).not.toMatch(/até \d{2}\/\d{2}/);
  });
});

describe('the other measures', () => {
  it('the warning has no end and still carries the statement and the appeal', () => {
    const mail = sanctionWarningMail(input({ rule: 'spam', statement: 'Mandou propaganda.' }));
    expect(mail.subject).toBe('Um aviso sobre a sua conta no Lorkarium');
    expect(mail.text).toContain('Mandou propaganda.');
    expect(mail.text).toContain('Spam e divulgação (§9 da Política de uso)');
    expect(mail.text).not.toMatch(/Prazo:|até \d{2}\/\d{2}/);
    expect(mail.text).toContain('Para contestar, responda a este e-mail');
  });

  it('the content removal says what was removed and why', () => {
    const mail = contentRemovedMail(input({ rule: 'copyright', statement: 'O mapa "Forte".' }));
    expect(mail.subject).toBe('Removemos um conteúdo da sua conta no Lorkarium');
    expect(mail.text).toContain('O mapa "Forte".');
    expect(mail.text).toContain('Direitos autorais e livros de RPG (§4 da Política de uso)');
  });

  it('the ban says the account is deleted and that a new one is refused', () => {
    const mail = accountBannedMail(input());
    expect(mail.subject).toBe('Sua conta no Lorkarium foi excluída');
    expect(mail.text).toContain('não pode ser convidado de novo');
    expect(mail.text).toContain('Para contestar, responda a este e-mail');
  });
});

describe('who applied and where to appeal', () => {
  it.each([
    ['warning', sanctionWarningMail],
    ['content removal', contentRemovedMail],
    ['suspension', accountSuspendedForMail],
    ['ban', accountBannedMail],
  ] as const)('the %s never says who applied it', (_kind, build) => {
    const mail = build(input());
    expect(mail.text).not.toMatch(/administrador|admin\b|@root/i);
  });

  it('without MAIL_REPLY_TO there is no Reply-To and the text points at the Contato of the site', () => {
    const mail = accountSuspendedForMail(input({ replyTo: null }));
    expect(mail.replyTo).toBeUndefined();
    expect(mail.text).toContain(
      `Para contestar, escreva para o e-mail de Contato no rodapé de ${SITE}`,
    );
    expect(mail.text).not.toContain('responda a este e-mail');
  });
});
