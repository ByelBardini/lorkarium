import { SANCTION_RULE_SECTIONS, type SanctionRule } from '@lorkarium/contracts';
import type { MailDetail, MailIcon, MailSpec } from '../../lib/mail/mail-spec';
import { ACCOUNT_STATE_FOOTER } from '../account-security/admin-mail.mapper';
import type { MailMessage } from '../account-security/mailer.port';
import {
  greeting,
  toMailMessage,
  type MailRecipient,
} from '../account-security/security-mail.mapper';

/** What a measure's e-mail says: the person, the rule, the reasons, the end of a suspension and
 *  when a ban deletes the account. `siteUrl` is the landing (the rule's link); `replyTo` the
 *  contact the appeal goes to, `null` = no Reply-To and the text points at the Contato of the
 *  site. Never who applied it. */
export type SanctionMailInput = Readonly<{
  person: MailRecipient;
  rule: SanctionRule;
  statement: string;
  until: Date | null;
  deletionDueAt: Date | null;
  publicUrl: string;
  siteUrl: string;
  replyTo: string | null;
}>;

// The product speaks pt-BR and keeps no time zone per person: Brasília, as the security notices.
const UNTIL = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

const KEPT = 'Suas mesas e personagens continuam guardados.';

/** Example: `sanctionWarningMail(input).subject // 'Um aviso sobre a sua conta no Lorkarium'` */
export function sanctionWarningMail(input: SanctionMailInput): MailMessage {
  const { person } = input;
  return measureMail(input, {
    subject: 'Um aviso sobre a sua conta no Lorkarium',
    preheader: 'Veja o motivo e como contestar.',
    icon: 'shieldOff',
    title: 'Um aviso sobre a sua conta',
    lead: `${greeting(person)} A conta @${person.username} recebeu um aviso por violar a Política de uso do Lorkarium. Ela continua funcionando normalmente; se a violação se repetir, a medida seguinte pode ser a suspensão.`,
    measure: 'Aviso',
  });
}

/** Example: `contentRemovedMail(input).subject // 'Removemos um conteúdo da sua conta no Lorkarium'` */
export function contentRemovedMail(input: SanctionMailInput): MailMessage {
  const { person } = input;
  return measureMail(input, {
    subject: 'Removemos um conteúdo da sua conta no Lorkarium',
    preheader: 'Veja o que saiu, o motivo e como contestar.',
    icon: 'shieldOff',
    title: 'Um conteúdo foi removido',
    lead: `${greeting(person)} Removemos um conteúdo da conta @${person.username} por violar a Política de uso do Lorkarium. A conta continua funcionando normalmente.`,
    measure: 'Remoção de conteúdo',
  });
}

/** Example: `accountSuspendedForMail(input).subject // 'Sua conta no Lorkarium foi suspensa'` */
export function accountSuspendedForMail(input: SanctionMailInput): MailMessage {
  const { person, until } = input;
  const end = until ? `até ${untilLabel(until)}` : 'sem prazo';
  return measureMail(input, {
    subject: 'Sua conta no Lorkarium foi suspensa',
    preheader: until
      ? `Suspensa ${end}. Veja o motivo e como contestar.`
      : 'Veja o motivo e como contestar.',
    icon: 'pause',
    title: 'Sua conta foi suspensa',
    lead: `${greeting(person)} A conta @${person.username} foi suspensa por violar a Política de uso do Lorkarium. Você foi desconectado e não consegue entrar enquanto a suspensão valer. ${KEPT}`,
    measure: 'Suspensão temporária',
    period: until ? `${end}; depois disso, o acesso volta sozinho` : end,
  });
}

/** A ban suspends now and deletes later: the person has until `deletionDueAt` to appeal.
 *
 *  Example: `accountBannedMail(input).subject // 'Sua conta no Lorkarium será excluída'` */
export function accountBannedMail(input: SanctionMailInput): MailMessage {
  const { person } = input;
  const due = deletionLabel(input);
  return measureMail(input, {
    subject: 'Sua conta no Lorkarium será excluída',
    preheader: `Exclusão em ${due}. Veja o motivo e como contestar.`,
    icon: 'shieldOff',
    title: 'Sua conta será excluída',
    lead: `${greeting(person)} A conta @${person.username} foi suspensa por violar a Política de uso do Lorkarium e será excluída em ${due}, junto com as mesas de que é dona. Se você contestar antes dessa data, a exclusão espera a revisão. Depois da exclusão, este e-mail não poderá criar outra conta por 5 anos.`,
    measure: 'Exclusão da conta',
    period: `exclusão em ${due}`,
  });
}

/** The 18+ rule (Termos §3): no ban of the e-mail, and the paid plan is refunded in full.
 *
 *  Example: `ageRemovalMail(input).subject // 'Sua conta no Lorkarium será excluída pela idade mínima'` */
export function ageRemovalMail(input: SanctionMailInput): MailMessage {
  const { person } = input;
  const due = deletionLabel(input);
  return measureMail(input, {
    subject: 'Sua conta no Lorkarium será excluída pela idade mínima',
    preheader: `Exclusão em ${due}. Tem 18 anos ou mais? Conteste antes.`,
    icon: 'shieldOff',
    title: 'Sua conta será excluída',
    lead: `${greeting(person)} O Lorkarium é só para maiores de 18 anos, e recebemos sinais de que a conta @${person.username} pertence a alguém com menos idade. A conta foi suspensa e será excluída em ${due}. Se você tem 18 anos ou mais, conteste antes dessa data e a exclusão espera a revisão. Se você pagou um plano, devolvemos o valor integral.`,
    measure: 'Exclusão por idade',
    period: `exclusão em ${due}`,
  });
}

type MeasureCopy = Readonly<{
  subject: string;
  preheader: string;
  icon: MailIcon;
  title: string;
  lead: string;
  measure: string;
  period?: string;
}>;

function measureMail(input: SanctionMailInput, copy: MeasureCopy): MailMessage {
  const spec: MailSpec = {
    subject: copy.subject,
    preheader: copy.preheader,
    tone: 'alert',
    icon: copy.icon,
    title: copy.title,
    paragraphs: [copy.lead, `O motivo: ${input.statement}`],
    details: detailsOf(input.rule, copy),
    button: { label: 'Ler a regra', href: ruleUrlOf(input.siteUrl, input.rule) },
    note: appealNoteOf(input),
    footer: [ACCOUNT_STATE_FOOTER],
  };
  const message = toMailMessage(input.person.to, spec, input.publicUrl);
  return input.replyTo ? { ...message, replyTo: input.replyTo } : message;
}

function detailsOf(rule: SanctionRule, copy: MeasureCopy): MailDetail[] {
  const { section, title } = SANCTION_RULE_SECTIONS[rule];
  const details: MailDetail[] = [
    { label: 'Medida', value: copy.measure },
    { label: 'Regra', value: `${title} (§${section} da Política de uso)` },
  ];
  if (copy.period) details.push({ label: 'Prazo', value: copy.period });
  return details;
}

// Use policy §14: the appeal is reviewed by a person and answered in 15 days.
function appealNoteOf({ replyTo, siteUrl }: SanctionMailInput): string {
  const review = 'Uma pessoa revê a contestação e responde em até 15 dias.';
  if (replyTo) return `Para contestar, responda a este e-mail explicando por quê. ${review}`;
  return `Para contestar, escreva para o e-mail de Contato no rodapé de ${siteUrl} explicando por quê. ${review}`;
}

/** The heading of the rule in the landing's use policy.
 *
 *  Example: `ruleUrlOf('https://x.com', 'spam') // 'https://x.com/uso/#9-spam-e-divulga%C3%A7%C3%A3o'` */
export function ruleUrlOf(siteUrl: string, rule: SanctionRule): string {
  return `${siteUrl}/uso/#${encodeURIComponent(SANCTION_RULE_SECTIONS[rule].anchor)}`;
}

function untilLabel(until: Date): string {
  return `${UNTIL.format(until).replace(', ', ' às ')} (horário de Brasília)`;
}

function deletionLabel({ deletionDueAt }: SanctionMailInput): string {
  if (!deletionDueAt) throw new Error('a ban e-mail needs its deletionDueAt; got null');
  return untilLabel(deletionDueAt);
}
