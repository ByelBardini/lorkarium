import type { MailButton, MailSpec } from '../../lib/mail/mail-spec';
import type { MailMessage } from '../account-security/mailer.port';
import {
  greeting,
  toMailMessage,
  type MailRecipient,
} from '../account-security/security-mail.mapper';

/** What the admin wrote, as it goes into each e-mail. */
export type BroadcastLetter = Readonly<{
  subject: string;
  title: string;
  paragraphs: readonly string[];
  button: MailButton | null;
}>;

export type BroadcastMailInput = Readonly<{
  person: MailRecipient;
  letter: BroadcastLetter;
  publicUrl: string;
  /** `MAIL_REPLY_TO`; null = the mail goes from the no-reply sender only. */
  replyTo: string | null;
}>;

// A service notice is part of the contract (price, conditions, end of the service): no opt-out.
export const BROADCAST_FOOTER =
  'Este aviso faz parte do serviço do Lorkarium e não pode ser desligado.';
const PREHEADER_MAX = 100;

/** The notice as a `MailSpec`: the greeting opens the first paragraph, the rest as written.
 *
 *  Example: `broadcastMailSpec({ person, letter, publicUrl, replyTo: null }).tone // 'gold'` */
export function broadcastMailSpec(input: BroadcastMailInput): MailSpec {
  const { person, letter, replyTo } = input;
  const [first = '', ...rest] = letter.paragraphs;
  return {
    subject: letter.subject,
    preheader: preheaderOf(first),
    tone: 'gold',
    icon: 'mailSwap',
    title: letter.title,
    paragraphs: [`${greeting(person)} ${first}`, ...rest],
    ...(letter.button ? { button: letter.button } : {}),
    note: replyTo
      ? 'Dúvidas? É só responder a este e-mail.'
      : 'Dúvidas? Fale com a gente pelo Contato do site do Lorkarium.',
    footer: [BROADCAST_FOOTER],
  };
}

/** The rendered notice to one person, answering to `replyTo` when there is one.
 *
 *  Example: `await mailer.send(broadcastMail({ person, letter, publicUrl, replyTo }))` */
export function broadcastMail(input: BroadcastMailInput): MailMessage {
  const message = toMailMessage(input.person.to, broadcastMailSpec(input), input.publicUrl);
  return input.replyTo ? { ...message, replyTo: input.replyTo } : message;
}

function preheaderOf(paragraph: string): string {
  if (paragraph.length <= PREHEADER_MAX) return paragraph;
  return `${paragraph.slice(0, PREHEADER_MAX - 1)}…`;
}
