import { validityLabel, type MailValidity } from '../../lib/mail/mail-validity';
import type { MailMessage } from './mailer.port';
import { greeting, toMailMessage, type MailRecipient } from './security-mail.mapper';

const ACCOUNT_STATE = 'Aviso sobre o estado da sua conta.';
const CANNOT_TURN_OFF = 'Este tipo de e-mail não pode ser desligado.';
/** The footer of every e-mail about the account's standing (suspension, a measure, admin role). */
export const ACCOUNT_STATE_FOOTER = `${ACCOUNT_STATE} ${CANNOT_TURN_OFF}`;

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

/** The link the person asked for at the public sign-up: they pick the @ and the password there.
 *
 *  Example: `signUpLinkMail({ to, link, validFor: { hours: 24 }, publicUrl }).subject // 'Confirme seu cadastro no Lorkarium'` */
export function signUpLinkMail(input: InvitationMailInput): MailMessage {
  const validity = validityLabel(input.validFor);
  return toMailMessage(
    input.to,
    {
      subject: 'Confirme seu cadastro no Lorkarium',
      preheader: 'Falta escolher seu @ e sua senha.',
      tone: 'gold',
      icon: 'user',
      title: 'Falta pouco para entrar',
      paragraphs: [
        'Recebemos um pedido para criar uma conta no Lorkarium, a mesa virtual para jogar RPG com o seu grupo, com este e-mail.',
        'Para terminar, é só escolher o seu @ e a sua senha.',
      ],
      details: [{ label: 'E-mail', value: input.to }],
      button: { label: 'Criar minha conta', href: input.link },
      note: `O link vale ${validity} e só funciona uma vez. Se vencer, peça outro na tela de cadastro.`,
      fallbackLink: true,
      footer: [
        'Se não foi você quem pediu, ignore este e-mail: nenhuma conta é criada sem o link.',
      ],
    },
    input.publicUrl,
  );
}

export type AccountExistsMailInput = Readonly<{
  person: MailRecipient;
  /** A new-password link issued for the account, so whoever forgot can get back in. */
  link: string;
  validFor: MailValidity;
  publicUrl: string;
}>;

/** Someone asked for a sign-up with the address of an existing account: only its owner reads
 *  this, so the reply on the screen can stay the same for every address.
 *
 *  Example: `accountExistsMail({ person, link, validFor: { hours: 1 }, publicUrl }).subject // 'Você já tem uma conta no Lorkarium'` */
export function accountExistsMail(input: AccountExistsMailInput): MailMessage {
  const { person, link, publicUrl } = input;
  const validity = validityLabel(input.validFor);
  return toMailMessage(
    person.to,
    {
      subject: 'Você já tem uma conta no Lorkarium',
      preheader: `Sua conta é @${person.username}.`,
      tone: 'gold',
      icon: 'user',
      title: 'Você já tem uma conta',
      paragraphs: [
        `${greeting(person)} Alguém pediu para criar uma conta no Lorkarium com este e-mail, mas ele já é da conta @${person.username}.`,
        'Para entrar, use o seu @ ou este e-mail na tela de login. Se esqueceu a senha, crie uma nova pelo botão abaixo.',
      ],
      details: [{ label: 'Sua conta', value: `@${person.username}` }],
      button: { label: 'Criar nova senha', href: link },
      note: `O link vale ${validity} e só funciona uma vez.`,
      fallbackLink: true,
      footer: ['Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.'],
    },
    publicUrl,
  );
}

export type PasswordLinkMailInput = Readonly<{
  person: MailRecipient;
  link: string;
  validFor: MailValidity;
  publicUrl: string;
  /** `admin` = sent from the backoffice; `self` = asked for at "Esqueci minha senha". */
  requestedBy: 'admin' | 'self';
}>;

/** The new-password link an admin sent or the person asked for; the current password works until
 *  it is used.
 *
 *  Example: `passwordLinkMail({ person, link, validFor: { hours: 1 }, publicUrl, requestedBy: 'self' }).subject // 'Crie uma senha nova no Lorkarium'` */
export function passwordLinkMail({
  person,
  link,
  validFor,
  publicUrl,
  requestedBy,
}: PasswordLinkMailInput): MailMessage {
  const validity = validityLabel(validFor);
  const account = `a conta @${person.username}`;
  const why =
    requestedBy === 'self'
      ? `Você pediu um link para criar uma senha nova para ${account}.`
      : `Um administrador do Lorkarium mandou este link para você escolher uma senha nova para ${account}.`;
  return toMailMessage(
    person.to,
    {
      subject: 'Crie uma senha nova no Lorkarium',
      preheader: `O link vale ${validity}.`,
      tone: 'gold',
      icon: 'key',
      title: 'Hora de criar uma senha nova',
      paragraphs: [`${greeting(person)} ${why}`],
      button: { label: 'Criar nova senha', href: link },
      note: `O link vale ${validity} e só funciona uma vez.`,
      fallbackLink: true,
      footer: ['Se você não esperava este e-mail, ignore: sua senha continua a mesma.'],
    },
    publicUrl,
  );
}

export type AccountStateMailInput = Readonly<{ person: MailRecipient; publicUrl: string }>;

// The suspension's e-mail carries the rule, the reasons and the appeal: `accountSuspendedForMail`
// in the sanctions module.

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
