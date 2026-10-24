import { validityLabel, type MailValidity } from '../../lib/mail/mail-validity';
import type { MailMessage } from './mailer.port';
import { greeting, toMailMessage, type MailRecipient } from './security-mail.mapper';

const ACCOUNT_STATE = 'Aviso sobre o estado da sua conta.';
const CANNOT_TURN_OFF = 'Este tipo de e-mail não pode ser desligado.';

export type InvitationMailInput = Readonly<{
  to: string;
  link: string;
  validFor: MailValidity;
  publicUrl: string;
}>;

/** The invitation from the backoffice: the person picks the @ and the password at the link. It
 *  names no one: who invited stays in the backoffice.
 *
 *  Example: `invitationMail({ to, link, validFor: { days: 7 }, publicUrl }).subject // 'Seu convite para o Lorkarium'` */
export function invitationMail(input: InvitationMailInput): MailMessage {
  const validity = validityLabel(input.validFor);
  return toMailMessage(
    input.to,
    {
      subject: 'Seu convite para o Lorkarium',
      preheader: 'Escolha seu @ e sua senha para entrar.',
      tone: 'gold',
      icon: 'user',
      title: 'Sua cadeira está reservada',
      paragraphs: [
        'Você tem um convite para o Lorkarium, a mesa virtual para jogar RPG com o seu grupo.',
        'Para entrar, é só escolher o seu @ e a sua senha.',
      ],
      details: [{ label: 'E-mail', value: input.to }],
      button: { label: 'Criar minha conta', href: input.link },
      note: `O link vale ${validity} e só funciona uma vez. Se vencer, peça um novo convite.`,
      fallbackLink: true,
      footer: ['Você recebeu porque um administrador do Lorkarium cadastrou este e-mail.'],
    },
    input.publicUrl,
  );
}

export type PasswordLinkMailInput = Readonly<{
  person: MailRecipient;
  link: string;
  validFor: MailValidity;
  publicUrl: string;
}>;

/** The new-password link an admin sent; the current password works until it is used.
 *
 *  Example: `passwordLinkMail({ person, link, validFor: { hours: 1 }, publicUrl }).subject // 'Crie uma senha nova no Lorkarium'` */
export function passwordLinkMail({
  person,
  link,
  validFor,
  publicUrl,
}: PasswordLinkMailInput): MailMessage {
  const validity = validityLabel(validFor);
  return toMailMessage(
    person.to,
    {
      subject: 'Crie uma senha nova no Lorkarium',
      preheader: `O link vale ${validity}.`,
      tone: 'gold',
      icon: 'key',
      title: 'Hora de criar uma senha nova',
      paragraphs: [
        `${greeting(person)} Um administrador do Lorkarium mandou este link para você escolher uma senha nova para a conta @${person.username}.`,
      ],
      button: { label: 'Criar nova senha', href: link },
      note: `O link vale ${validity} e só funciona uma vez.`,
      fallbackLink: true,
      footer: ['Se você não esperava este e-mail, ignore: sua senha continua a mesma.'],
    },
    publicUrl,
  );
}

export type AccountStateMailInput = Readonly<{ person: MailRecipient; publicUrl: string }>;

/** Example: `accessSuspendedMail({ person, publicUrl }).subject // 'Seu acesso ao Lorkarium foi suspenso'` */
export function accessSuspendedMail({ person, publicUrl }: AccountStateMailInput): MailMessage {
  return toMailMessage(
    person.to,
    {
      subject: 'Seu acesso ao Lorkarium foi suspenso',
      preheader: 'Se achar que foi engano, fale com quem administra o Lorkarium.',
      tone: 'alert',
      icon: 'pause',
      title: 'Seu acesso foi suspenso',
      paragraphs: [
        `${greeting(person)} Um administrador suspendeu o acesso da conta @${person.username}. Você foi desconectado e não consegue entrar enquanto a suspensão valer.`,
        'Suas mesas e personagens continuam guardados.',
      ],
      note: 'Se achar que foi engano, fale com quem administra o Lorkarium.',
      footer: [`${ACCOUNT_STATE} ${CANNOT_TURN_OFF}`],
    },
    publicUrl,
  );
}

/** Example: `accessRestoredMail({ person, publicUrl }).subject // 'Seu acesso ao Lorkarium voltou'` */
export function accessRestoredMail({ person, publicUrl }: AccountStateMailInput): MailMessage {
  return toMailMessage(
    person.to,
    {
      subject: 'Seu acesso ao Lorkarium voltou',
      preheader: 'Pode entrar de novo: está tudo onde você deixou.',
      tone: 'ok',
      icon: 'check',
      title: 'Bem-vindo de volta',
      paragraphs: [
        `${greeting(person)} O acesso da conta @${person.username} foi reativado. Suas mesas e personagens estão onde você deixou.`,
      ],
      button: { label: 'Entrar no Lorkarium', href: `${publicUrl}/login` },
      footer: [ACCOUNT_STATE],
    },
    publicUrl,
  );
}

export type PromotedToAdminMailInput = AccountStateMailInput;

/** Says nobody's name: who granted it stays in the backoffice's log.
 *
 *  Example: `promotedToAdminMail({ person, publicUrl }).subject // 'Você agora é admin do Lorkarium'` */
export function promotedToAdminMail(input: PromotedToAdminMailInput): MailMessage {
  const { person, publicUrl } = input;
  return toMailMessage(
    person.to,
    {
      subject: 'Você agora é admin do Lorkarium',
      preheader: 'Sua conta passou a ter acesso ao backoffice.',
      tone: 'dark',
      icon: 'user',
      title: 'Você ganhou acesso de admin',
      paragraphs: [
        `${greeting(person)} A conta @${person.username} passou a ter acesso ao backoffice do Lorkarium. Lá é possível convidar pessoas, suspender e excluir contas.`,
      ],
      button: { label: 'Abrir o backoffice', href: `${publicUrl}/admin` },
      warning: {
        title: 'Dica:',
        text: 'com acesso de admin, vale ligar a verificação em duas etapas.',
      },
      footer: [`${ACCOUNT_STATE} ${CANNOT_TURN_OFF}`],
    },
    publicUrl,
  );
}
