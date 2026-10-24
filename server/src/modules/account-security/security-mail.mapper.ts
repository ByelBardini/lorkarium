import { deviceLabel } from '@lorkarium/contracts';
import { renderMail } from '../../lib/mail/mail-layout';
import type { MailDetail, MailSpec } from '../../lib/mail/mail-spec';
import { validityLabel } from '../../lib/mail/mail-validity';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UserPo } from '../auth/users.po';
import { deviceOf } from './account-security.mapper';
import { RECOVERY_TTL_MS } from './account-recovery.bo';
import { EMAIL_CHANGE_MS } from './email-change.bo';
import type { MailMessage } from './mailer.port';

/** Who an e-mail is for: the address it goes to, the nickname it greets and the @ it names. */
export type MailRecipient = Readonly<{ to: string; name: string; username: string }>;

/** The request that caused a notice: when, and the user agent it came from. */
export type MailOrigin = Readonly<{ at: Date; userAgent: string | null }>;

// The product speaks pt-BR; the server keeps no time zone per person, so Brasília is the default.
const WHEN = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export const SECURITY_FOOTER = [
  'Aviso de segurança da sua conta. Este tipo de e-mail não pode ser desligado.',
] as const;

const NOT_YOU = 'Não foi você?';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Example: `whenLabel(new Date('2026-10-24T06:14:00Z')) // '24 de outubro de 2026 às 03:14 (horário de Brasília)'` */
export function whenLabel(at: Date): string {
  return `${WHEN.format(at)} (horário de Brasília)`;
}

/** "Quando" and "De onde" of a security notice; the device is the only "where" the server keeps. */
export function originDetails(origin: MailOrigin): MailDetail[] {
  return [
    { label: 'Quando', value: whenLabel(origin.at) },
    { label: 'De onde', value: deviceLabel(deviceOf(origin.userAgent)) },
  ];
}

/** The rendered spec addressed to `to`.
 *
 *  Example: `toMailMessage('ana@x.com', spec, 'https://mesa.example.com').subject // spec.subject` */
export function toMailMessage(to: string, spec: MailSpec, publicUrl: string): MailMessage {
  return { to, subject: spec.subject, ...renderMail(spec, publicUrl) };
}

/** The account as the addressee of a mail to its own (decrypted) address.
 *
 *  Example: `recipientOf(row, cipher) // { to: 'ana@x.com', name: 'Ana', username: 'ana' }` */
export function recipientOf(row: UserPo, cipher: DataCipherPort): MailRecipient {
  const to = cipher.open('user-email', row.emailCipher, row.id);
  return { to, name: row.name, username: row.username };
}

export function greeting(person: MailRecipient): string {
  return `Oi, ${person.name}!`;
}

export type TwoFactorChangedInput = Readonly<{
  person: MailRecipient;
  origin: MailOrigin;
  enabled: boolean;
  publicUrl: string;
}>;

/** Notice after 2FA was turned on (`enabled: true`) or off, pointing to the account's security.
 *
 *  Example: `twoFactorChangedMail({ person, origin, enabled: true, publicUrl }).subject // 'Verificação em duas etapas ligada'` */
export function twoFactorChangedMail(input: TwoFactorChangedInput): MailMessage {
  const spec = input.enabled ? twoFactorOnSpec(input) : twoFactorOffSpec(input);
  return toMailMessage(input.person.to, spec, input.publicUrl);
}

function twoFactorOnSpec({ person, origin, publicUrl }: TwoFactorChangedInput): MailSpec {
  return {
    subject: 'Verificação em duas etapas ligada',
    preheader: 'Agora, além da senha, vamos pedir o código do seu app autenticador.',
    tone: 'ok',
    icon: 'shield',
    title: 'Sua conta ficou mais protegida',
    paragraphs: [
      `${greeting(person)} A verificação em duas etapas está ligada na conta @${person.username}. Agora, além da senha, vamos pedir o código do seu app autenticador.`,
      'Guarde seus códigos de recuperação num lugar seguro. Eles são o único jeito de entrar se você perder o celular.',
    ],
    details: originDetails(origin),
    button: { label: 'Ver a segurança da conta', href: `${publicUrl}/account` },
    warning: {
      title: NOT_YOU,
      text: 'Troque sua senha agora em Minha conta e encerre as sessões que não reconhece.',
    },
    footer: SECURITY_FOOTER,
  };
}

function twoFactorOffSpec({ person, origin, publicUrl }: TwoFactorChangedInput): MailSpec {
  return {
    subject: 'Verificação em duas etapas desligada',
    preheader: 'Sua conta voltou a pedir só a senha para entrar.',
    tone: 'alert',
    icon: 'shieldOff',
    title: 'A verificação em duas etapas foi desligada',
    paragraphs: [
      `${greeting(person)} A conta @${person.username} voltou a pedir só a senha para entrar. Os códigos de recuperação antigos não valem mais.`,
    ],
    details: originDetails(origin),
    button: { label: 'Ligar de novo', href: `${publicUrl}/account` },
    warning: {
      title: NOT_YOU,
      text: 'Alguém pode ter sua senha. Troque a senha agora em Minha conta e ligue a verificação de novo.',
    },
    footer: SECURITY_FOOTER,
  };
}

export type EmailConfirmationInput = Readonly<{
  /** `to` is the new address; `name` and `username` are the account's. */
  person: MailRecipient;
  link: string;
  publicUrl: string;
}>;

/** The confirmation link, to the new address only; the token rides in the fragment.
 *
 *  Example: `emailConfirmationMail({ person, link, publicUrl }).subject // 'Confirme seu novo e-mail no Lorkarium'` */
export function emailConfirmationMail({
  person,
  link,
  publicUrl,
}: EmailConfirmationInput): MailMessage {
  const validity = validityLabel({ minutes: EMAIL_CHANGE_MS / 60_000 });
  return toMailMessage(
    person.to,
    {
      subject: 'Confirme seu novo e-mail no Lorkarium',
      preheader: 'Clique no botão para começar a usar este endereço na sua conta.',
      tone: 'gold',
      icon: 'mailSwap',
      title: 'Confirme que este e-mail é seu',
      paragraphs: [
        `${greeting(person)} Pediram para usar este endereço na conta @${person.username} do Lorkarium.`,
        'Até você confirmar, a conta continua usando o e-mail antigo.',
      ],
      button: { label: 'Confirmar novo e-mail', href: link },
      note: `O link vale ${validity} e só funciona uma vez.`,
      fallbackLink: true,
      footer: [
        'Você recebeu porque este endereço foi informado numa troca de e-mail. Se não foi você, ignore: nada muda na conta.',
      ],
    },
    publicUrl,
  );
}

export type RecoveryNoticeInput = Readonly<{
  person: MailRecipient;
  origin: MailOrigin;
  /** The "Não fui eu" link (`/account/recover#token=…`). */
  recoveryLink: string;
  publicUrl: string;
}>;

export type EmailNoticeInput = RecoveryNoticeInput & Readonly<{ maskedNewEmail: string }>;

/** Notice to the account's address after its password changed, with the way back.
 *
 *  Example: `passwordChangedMail({ person, origin, recoveryLink, publicUrl }).subject // 'Sua senha do Lorkarium foi trocada'` */
export function passwordChangedMail(input: RecoveryNoticeInput): MailMessage {
  const { person, origin, recoveryLink } = input;
  return toMailMessage(
    person.to,
    {
      subject: 'Sua senha do Lorkarium foi trocada',
      preheader: 'Desconectamos os outros aparelhos por segurança.',
      tone: 'dark',
      icon: 'lock',
      title: 'Sua senha foi trocada',
      paragraphs: [
        `${greeting(person)} A senha da conta @${person.username} acabou de ser trocada. Por segurança, desconectamos todos os outros aparelhos.`,
      ],
      details: originDetails(origin),
      button: { label: 'Não fui eu, recuperar a conta', href: recoveryLink },
      warning: {
        title: NOT_YOU,
        text: `Use o botão acima em até ${recoveryValidity()}: ele pede uma senha nova e desconecta todos os aparelhos.`,
      },
      footer: SECURITY_FOOTER,
    },
    input.publicUrl,
  );
}

/** Notice to the current address that a change to the masked new one was asked.
 *
 *  Example: `emailChangeRequestedMail({ person, origin, maskedNewEmail, recoveryLink, publicUrl })` */
export function emailChangeRequestedMail(input: EmailNoticeInput): MailMessage {
  const { person, origin, recoveryLink } = input;
  return toMailMessage(
    person.to,
    {
      subject: 'Pediram para trocar o e-mail da sua conta',
      preheader: 'A troca só vale depois que o novo endereço for confirmado.',
      tone: 'alert',
      icon: 'mailSwap',
      title: 'Pediram para trocar o e-mail da sua conta',
      paragraphs: [
        `${greeting(person)} Recebemos um pedido para trocar o e-mail da conta @${person.username}. A troca só acontece depois que o novo endereço for confirmado.`,
      ],
      details: [{ label: 'Novo e-mail', value: input.maskedNewEmail }, ...originDetails(origin)],
      button: { label: 'Não fui eu, cancelar a troca', href: recoveryLink },
      warning: {
        title: NOT_YOU,
        text: 'Cancele a troca pelo botão acima: ele também pede uma senha nova e desconecta todos os aparelhos.',
      },
      footer: SECURITY_FOOTER,
    },
    input.publicUrl,
  );
}

/** Notice to the old address that the e-mail is now the masked new one: the last one sent there.
 *
 *  Example: `emailChangedMail({ person, origin, maskedNewEmail, recoveryLink, publicUrl })` */
export function emailChangedMail(input: EmailNoticeInput): MailMessage {
  const { person, origin, recoveryLink } = input;
  return toMailMessage(
    person.to,
    {
      subject: 'O e-mail da sua conta foi trocado',
      preheader: 'A partir de agora, os avisos vão para o novo endereço.',
      tone: 'dark',
      icon: 'check',
      title: 'O e-mail da sua conta mudou',
      paragraphs: [
        `${greeting(person)} O e-mail da conta @${person.username} agora é ${input.maskedNewEmail}. Este é o último aviso que mandamos para cá.`,
      ],
      details: originDetails(origin),
      button: { label: 'Não fui eu, recuperar a conta', href: recoveryLink },
      warning: {
        title: 'Não reconhece essa troca?',
        text: `Use o botão acima em até ${recoveryValidity()} para voltar o e-mail antigo e escolher uma senha nova.`,
      },
      footer: SECURITY_FOOTER,
    },
    input.publicUrl,
  );
}

function recoveryValidity(): string {
  return validityLabel({ days: RECOVERY_TTL_MS / DAY_MS });
}
