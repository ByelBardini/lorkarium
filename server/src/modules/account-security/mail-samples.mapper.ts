import {
  accessRestoredMail,
  accountExistsMail,
  invitationMail,
  passwordLinkMail,
  signUpLinkMail,
  promotedToAdminMail,
} from './admin-mail.mapper';
import {
  accountBannedMail,
  accountSuspendedForMail,
  ageRemovalMail,
  contentRemovedMail,
  sanctionWarningMail,
} from '../sanctions/sanction-mail.mapper';
import { broadcastMail } from '../broadcasts/broadcast-mail.mapper';
import { feedbackPublishedMail } from '../feedback/feedback-mail.mapper';
import { reportReviewedMail } from '../reports/report-mail.mapper';
import type { MailMessage } from './mailer.port';
import {
  emailChangedMail,
  emailChangeRequestedMail,
  emailConfirmationMail,
  passwordChangedMail,
  twoFactorChangedMail,
  type MailOrigin,
  type MailRecipient,
} from './security-mail.mapper';

/** One system e-mail filled with sample data: `id` is stable (the backoffice's button), `name`
 *  is how a person calls it. */
export type MailSample = Readonly<{ id: string; name: string; message: MailMessage }>;

// The mock's people (docs/pages/mails/Emails.dc.html); the tokens are made up and lead nowhere.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
// The day the sample report was sent: any past day reads like a real one.
const SAMPLE_REPORTED_AT = new Date('2026-11-12T15:00:00Z');

// A price notice as the backoffice would write it; the sample has no reply-to (the env's).
function broadcastSample(person: MailRecipient, publicUrl: string): MailMessage {
  const letter = {
    subject: 'Os preços do Narrador mudam em 30 dias',
    title: 'Novos preços dos planos',
    paragraphs: [
      'A partir de 1º de janeiro o Narrador mensal passa a custar R$ 19,90. Até lá, nada muda.',
      'Quem já paga o plano anual mantém o preço até o fim do período.',
    ],
    button: { label: 'Ver meu plano', href: `${publicUrl}/account` },
  };
  return broadcastMail({ person, letter, publicUrl, replyTo: null });
}

// A measure as the backoffice would write it; the sample has no reply-to (the env's).
function sanctionSamples(to: string, publicUrl: string, siteUrl: string, at: Date): MailSample[] {
  const pedro = { to, name: 'Pedro', username: 'pedrinho' };
  const measure = {
    ...{ person: pedro, publicUrl, siteUrl, replyTo: null },
    ...{ until: null, deletionDueAt: null },
  } as const;
  const harassment = 'Mandou mensagens ameaçando um jogador real no chat da mesa "Vharn".';
  const until = new Date(at.getTime() + 7 * 24 * 60 * 60_000);
  const spam = {
    ...measure,
    rule: 'spam',
    statement: 'Mandou propaganda a quem não é amigo.',
  } as const;
  const removal = {
    ...measure,
    rule: 'copyright',
    statement: 'O mapa "Forte" de um livro pago.',
  } as const;
  const suspension = { ...measure, rule: 'harassment', statement: harassment, until } as const;
  const deletionDueAt = new Date(at.getTime() + 15 * 24 * 60 * 60_000);
  const ban = { ...measure, rule: 'harassment', statement: harassment, deletionDueAt } as const;
  const age = {
    ...{ ...measure, deletionDueAt },
    rule: 'minimum_age',
    statement: 'Disse no chat da mesa "Vharn" que tem 15 anos.',
  } as const;
  return [
    sample('sanction-warning', 'Aviso por violação', sanctionWarningMail(spam)),
    sample('content-removed', 'Conteúdo removido', contentRemovedMail(removal)),
    sample('account-suspended', 'Conta suspensa', accountSuspendedForMail(suspension)),
    sample('account-banned', 'Exclusão por violação agendada', accountBannedMail(ban)),
    sample('account-age-removal', 'Exclusão por idade agendada', ageRemovalMail(age)),
  ];
}

/** One sample of every system e-mail, all addressed to `to`, in the catalog order (the
 *  `pnpm mail:preview` and the backoffice's "E-mails" page). `at` is the "Quando" of the
 *  notices: the moment of the send, so the sample reads like a real one. `siteUrl` is the
 *  landing, where the measures' rule links go.
 *
 *  Example: `mailSamples('preview@lorkarium.dev', 'http://localhost:5173', clock.now(), 'http://localhost:4321').length // 17` */
export function mailSamples(
  to: string,
  publicUrl: string,
  at: Date,
  siteUrl: string,
): readonly MailSample[] {
  const measures = sanctionSamples(to, publicUrl, siteUrl, at);
  return [...accountSamples(to, publicUrl, at), ...backofficeSamples(to, publicUrl, measures)];
}

function accountSamples(to: string, publicUrl: string, at: Date): MailSample[] {
  const origin: MailOrigin = { at, userAgent: USER_AGENT };
  const lucas = { to, name: 'Lucas', username: 'lucas.rola20' };
  const recover = `${publicUrl}/account/recover#token=amostra-recuperacao`;
  const notice = { person: lucas, origin, recoveryLink: recover, publicUrl };
  const masked = { ...notice, maskedNewEmail: 'l*********@exemplo.com' };
  const twoFactor = { person: lucas, origin, publicUrl };
  const confirmLink = `${publicUrl}/account/email/confirm#token=amostra`;
  return [
    sample(
      'email-confirmation',
      'Confirmação do novo e-mail',
      emailConfirmationMail({ person: lucas, link: confirmLink, publicUrl }),
    ),
    sample('email-change-requested', 'Pedido de troca de e-mail', emailChangeRequestedMail(masked)),
    sample('email-changed', 'E-mail trocado', emailChangedMail(masked)),
    sample('password-changed', 'Senha trocada', passwordChangedMail(notice)),
    sample('two-factor-on', '2FA ligado', twoFactorChangedMail({ ...twoFactor, enabled: true })),
    sample(
      'two-factor-off',
      '2FA desligado',
      twoFactorChangedMail({ ...twoFactor, enabled: false }),
    ),
  ];
}

function backofficeSamples(
  to: string,
  publicUrl: string,
  measures: readonly MailSample[],
): MailSample[] {
  const lucas = { to, name: 'Lucas', username: 'lucas.rola20' };
  const pedro = { to, name: 'Pedro', username: 'pedrinho' };
  const inviteLink = `${publicUrl}/invite#token=amostra`;
  const resetLink = `${publicUrl}/reset-password#token=amostra`;
  return [
    sample(
      'invitation',
      'Convite',
      invitationMail({
        to,
        link: inviteLink,
        validFor: { days: 7 },
        publicUrl,
      }),
    ),
    ...signUpSamples(to, publicUrl, lucas),
    sample(
      'password-link',
      'Link de nova senha',
      passwordLinkMail({
        person: lucas,
        link: resetLink,
        validFor: { hours: 1 },
        publicUrl,
        requestedBy: 'admin',
      }),
    ),
    sample(
      'password-link-requested',
      'Link de nova senha (pedido pela pessoa)',
      passwordLinkMail({
        person: lucas,
        link: resetLink,
        validFor: { hours: 1 },
        publicUrl,
        requestedBy: 'self',
      }),
    ),
    ...measures,
    sample('access-restored', 'Acesso reativado', accessRestoredMail({ person: pedro, publicUrl })),
    sample('promoted-to-admin', 'Agora é admin', promotedToAdminMail({ person: pedro, publicUrl })),
    sample(
      'report-reviewed',
      'Denúncia analisada',
      reportReviewedMail({ person: lucas, reportedAt: SAMPLE_REPORTED_AT, publicUrl }),
    ),
    sample('feedback-published', 'Relato publicado', feedbackSample(lucas, publicUrl)),
    sample('broadcast', 'Comunicado', broadcastSample(lucas, publicUrl)),
  ];
}

function feedbackSample(person: MailRecipient, publicUrl: string): MailMessage {
  const issueUrl = 'https://github.com/ByelBardini/lorkarium/issues/42';
  const sentAt = SAMPLE_REPORTED_AT;
  return feedbackPublishedMail({ person, sentAt, issueUrl, issueNumber: 42, publicUrl });
}

function sample(id: string, name: string, message: MailMessage): MailSample {
  return { id, name, message };
}

// The two e-mails of the public sign-up: the confirmation link and the "you already have one".
function signUpSamples(to: string, publicUrl: string, person: MailRecipient): MailSample[] {
  const link = `${publicUrl}/sign-up/confirm#token=amostra`;
  const resetLink = `${publicUrl}/reset-password#token=amostra`;
  const confirmation = signUpLinkMail({ to, link, validFor: { hours: 24 }, publicUrl });
  const exists = accountExistsMail({ person, link: resetLink, validFor: { hours: 1 }, publicUrl });
  return [
    sample('sign-up-link', 'Confirmação do cadastro', confirmation),
    sample('account-exists', 'Você já tem conta (cadastro)', exists),
  ];
}
