import { describe, expect, it } from 'vitest';
import {
  accountBannedMail,
  accountSuspendedForMail,
  ageRemovalMail,
  contentRemovedMail,
  sanctionWarningMail,
  type SanctionMailInput,
} from '../../../src/modules/sanctions/sanction-mail.mapper';

const APP = 'https://mesa.example.com';
const SITE = 'https://lorkarium.example.com';
const CONTACT = 'contato@lorkarium.example.com';
const RULE_LINK = `${SITE}/uso/#2-respeito-%C3%A0s-pessoas`;
const DUE = new Date('2026-12-04T12:00:00Z');

function input(overrides: Partial<SanctionMailInput> = {}): SanctionMailInput {
  return {
    person: { to: 'caio@mesa.com', name: 'Caio', username: 'caio' },
    rule: 'harassment',
    statement: 'Ameaçou um jogador real no chat da mesa Vharn.',
    until: null,
    deletionDueAt: DUE,
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

  it('the ban says the account is suspended now and deleted on the date, unless appealed', () => {
    const mail = accountBannedMail(input());
    expect(mail.subject).toBe('Sua conta no Lorkarium será excluída');
    expect(mail.text).toContain('foi suspensa');
    expect(mail.text).toContain('será excluída em 04/12/2026 às 09:00 (horário de Brasília)');
    expect(mail.text).toContain('Se você contestar antes dessa data, a exclusão espera a revisão');
    expect(mail.text).toContain('não poderá criar outra conta por 5 anos');
    expect(mail.text).toContain('Prazo: exclusão em 04/12/2026');
    expect(mail.text).toContain('Para contestar, responda a este e-mail');
  });

  it('the age removal cites the 18+ rule, the date, the appeal and the refund, never a ban', () => {
    const mail = ageRemovalMail(input({ rule: 'minimum_age', statement: 'Disse que tem 15.' }));
    expect(mail.subject).toBe('Sua conta no Lorkarium será excluída pela idade mínima');
    expect(mail.text).toContain('só para maiores de 18 anos');
    expect(mail.text).toContain('Se você tem 18 anos ou mais, conteste antes dessa data');
    expect(mail.text).toContain('devolvemos o valor integral');
    expect(mail.text).toContain('Idade mínima (§8 da Política de uso)');
    expect(mail.text).not.toContain('5 anos');
  });

  it('a ban without its deletion date is a programming error naming the field', () => {
    expect(() => accountBannedMail(input({ deletionDueAt: null }))).toThrow(
      'a ban e-mail needs its deletionDueAt; got null',
    );
  });
});

describe('who applied and where to appeal', () => {
  it.each([
    ['warning', sanctionWarningMail],
    ['content removal', contentRemovedMail],
    ['suspension', accountSuspendedForMail],
    ['ban', accountBannedMail],
    ['age removal', ageRemovalMail],
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
