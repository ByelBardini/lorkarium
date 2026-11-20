import type { MailMessage } from '../account-security/mailer.port';
import {
  greeting,
  toMailMessage,
  type MailRecipient,
} from '../account-security/security-mail.mapper';

// The product speaks pt-BR; the server keeps no time zone per person, so Brasília is the default.
const DAY = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' });

export type ReportReviewedMailInput = Readonly<{
  person: MailRecipient;
  /** When the report was sent: the reporter tells which one by the day. */
  reportedAt: Date;
  publicUrl: string;
}>;

/** To whoever reported, once the admin closes the report: it was looked at. It never tells the
 *  measure (resolved and dismissed read the same) nor names the other account.
 *
 *  Example: `reportReviewedMail({ person, reportedAt, publicUrl }).subject // 'Sua denúncia foi analisada'` */
export function reportReviewedMail(input: ReportReviewedMailInput): MailMessage {
  const { person, publicUrl } = input;
  return toMailMessage(
    person.to,
    {
      subject: 'Sua denúncia foi analisada',
      preheader: 'A equipe do Lorkarium já olhou o que você mandou.',
      tone: 'dark',
      icon: 'check',
      title: 'Sua denúncia foi analisada',
      paragraphs: [
        `${greeting(person)} A denúncia que você enviou em ${DAY.format(input.reportedAt)} foi analisada pela equipe do Lorkarium.`,
        'Por respeito a todas as pessoas envolvidas, não contamos qual medida foi tomada.',
        'Obrigado por ajudar a manter as mesas um lugar bom para jogar.',
      ],
      footer: [
        'Aviso sobre uma denúncia que você fez. Este tipo de e-mail não pode ser desligado.',
      ],
    },
    publicUrl,
  );
}
