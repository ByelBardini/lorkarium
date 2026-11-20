import type { MailMessage } from '../account-security/mailer.port';
import {
  greeting,
  toMailMessage,
  type MailRecipient,
} from '../account-security/security-mail.mapper';

// The product speaks pt-BR; the server keeps no time zone per person, so Brasília is the default.
const DAY = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' });

export type FeedbackPublishedMailInput = Readonly<{
  person: MailRecipient;
  /** When it was sent: the sender tells which one by the day. */
  sentAt: Date;
  issueUrl: string;
  issueNumber: number;
  publicUrl: string;
}>;

/** To whoever sent a bug report or a suggestion, once the admin publishes it: the link to follow
 *  the issue. Archiving sends nothing.
 *
 *  Example: `feedbackPublishedMail({ person, sentAt, issueUrl, issueNumber: 42, publicUrl }).subject // 'Seu relato virou a issue #42'` */
export function feedbackPublishedMail(input: FeedbackPublishedMailInput): MailMessage {
  const { person, issueUrl, issueNumber } = input;
  return toMailMessage(
    person.to,
    {
      subject: `Seu relato virou a issue #${issueNumber}`,
      preheader: 'Agora dá para acompanhar o que você mandou no GitHub.',
      tone: 'ok',
      icon: 'check',
      title: 'Seu relato virou uma issue',
      paragraphs: [
        `${greeting(person)} O relato que você enviou em ${DAY.format(input.sentAt)} foi revisado pela equipe do Lorkarium e publicado como a issue #${issueNumber}.`,
        'Publicamos só o texto revisado: seu @, seu e-mail e os prints ficaram de fora.',
        'Obrigado por ajudar a melhorar o Lorkarium.',
      ],
      button: { label: 'Acompanhar no GitHub', href: issueUrl },
      fallbackLink: true,
      footer: [
        'Aviso sobre um relato que você enviou. Este tipo de e-mail não pode ser desligado.',
      ],
    },
    input.publicUrl,
  );
}
