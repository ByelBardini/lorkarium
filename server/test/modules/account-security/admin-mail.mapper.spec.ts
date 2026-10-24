import { describe, expect, it } from 'vitest';
import {
  accessRestoredMail,
  accessSuspendedMail,
  invitationMail,
  passwordLinkMail,
  promotedToAdminMail,
} from '../../../src/modules/account-security/admin-mail.mapper';

const PUBLIC_URL = 'https://mesa.example.com';
const INVITE_LINK = 'https://mesa.example.com/invite#token=z1';
const RESET_LINK = 'https://mesa.example.com/reset-password#token=q7';
const LUCAS = { to: 'lucas@exemplo.com', name: 'Lucas', username: 'lucas.rola20' };
const PEDRO = { to: 'pedro@exemplo.com', name: 'Pedro', username: 'pedrinho' };

describe('invitationMail', () => {
  const mail = invitationMail({
    to: 'marina@exemplo.com',
    link: INVITE_LINK,
    validFor: { days: 7 },
    publicUrl: PUBLIC_URL,
  });

  it('goes to the invited address and names nobody', () => {
    expect(mail.to).toBe('marina@exemplo.com');
    expect(mail.subject).toBe('Seu convite para o Lorkarium');
    expect(mail.text).toContain('Sua cadeira está reservada');
    expect(mail.text).toContain(
      'Você tem um convite para o Lorkarium, a mesa virtual para jogar RPG com o seu grupo.',
    );
    expect(mail.text).toContain('E-mail: marina@exemplo.com');
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/Lucas|convidou/);
  });

  it('the button opens the invitation, with the validity and the fallback link', () => {
    expect(mail.text).toContain(`Criar minha conta: ${INVITE_LINK}`);
    expect(mail.text).toContain(
      'O link vale 7 dias e só funciona uma vez. Se vencer, peça um novo convite.',
    );
    expect(mail.html).toContain(`>${INVITE_LINK}</a>`);
    expect(mail.text).toContain(
      'Você recebeu porque um administrador do Lorkarium cadastrou este e-mail.',
    );
  });
});

describe('passwordLinkMail', () => {
  const mail = passwordLinkMail({
    person: LUCAS,
    link: RESET_LINK,
    validFor: { hours: 1 },
    publicUrl: PUBLIC_URL,
  });

  it('says an admin sent the link for the account @', () => {
    expect(mail.to).toBe('lucas@exemplo.com');
    expect(mail.text).toContain('Hora de criar uma senha nova');
    expect(mail.text).toContain(
      'Um administrador do Lorkarium mandou este link para você escolher uma senha nova para a conta @lucas.rola20.',
    );
  });

  it('the button, the one-hour note, the fallback and the "ignore" footer', () => {
    expect(mail.text).toContain(`Criar nova senha: ${RESET_LINK}`);
    expect(mail.text).toContain('O link vale 1 hora e só funciona uma vez.');
    expect(mail.html).toContain(`>${RESET_LINK}</a>`);
    expect(mail.text).toContain(
      'Se você não esperava este e-mail, ignore: sua senha continua a mesma.',
    );
  });
});

describe('accessSuspendedMail', () => {
  const mail = accessSuspendedMail({ person: PEDRO, publicUrl: PUBLIC_URL });

  it('has no button and says the tables are kept', () => {
    expect(mail.subject).toBe('Seu acesso ao Lorkarium foi suspenso');
    expect(mail.html).not.toContain('<a ');
    expect(mail.text).toContain(
      'Você foi desconectado e não consegue entrar enquanto a suspensão valer.',
    );
    expect(mail.text).toContain('Suas mesas e personagens continuam guardados.');
  });

  it('points to who runs the Lorkarium, in the alert tone with the pause icon', () => {
    expect(mail.text).toContain('Se achar que foi engano, fale com quem administra o Lorkarium.');
    expect(mail.html).toContain('icon-pause-alert.png');
  });
});

describe('accessRestoredMail', () => {
  it('welcomes back with the button to the login, in the ok tone', () => {
    const mail = accessRestoredMail({ person: PEDRO, publicUrl: PUBLIC_URL });
    expect(mail.text).toContain('Bem-vindo de volta');
    expect(mail.text).toContain('Entrar no Lorkarium: https://mesa.example.com/login');
    expect(mail.html).toContain('icon-check-ok.png');
  });
});

describe('promotedToAdminMail', () => {
  it('names nobody, opens the backoffice and tips the 2FA, in the dark tone', () => {
    const mail = promotedToAdminMail({
      person: PEDRO,
      publicUrl: PUBLIC_URL,
    });
    expect(mail.text).toContain(
      'Oi, Pedro! A conta @pedrinho passou a ter acesso ao backoffice do Lorkarium.',
    );
    expect(`${mail.subject}${mail.text}`).not.toContain('Lucas');
    expect(mail.text).toContain('Abrir o backoffice: https://mesa.example.com/admin');
    expect(mail.text).toContain(
      'Dica: com acesso de admin, vale ligar a verificação em duas etapas.',
    );
    expect(mail.html).toContain('icon-user-dark.png');
  });
});

describe('validity', () => {
  it('a zero-day link is refused citing the value', () => {
    const invite = () =>
      invitationMail({
        to: 'marina@exemplo.com',
        link: INVITE_LINK,
        validFor: { days: 0 },
        publicUrl: PUBLIC_URL,
      });
    expect(invite).toThrow('{"days":0}');
  });
});
