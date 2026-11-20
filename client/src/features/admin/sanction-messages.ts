import {
  SANCTION_RULE_SECTIONS,
  type AccountSanctionDto,
  type SanctionKind,
  type SanctionRule,
} from '@lorkarium/contracts';

/** How the backoffice names each measure (the scale of the use policy, §13). */
export const SANCTION_KIND_LABEL: Readonly<Record<SanctionKind, string>> = {
  warning: 'Aviso',
  content_removal: 'Remoção de conteúdo',
  suspension: 'Suspensão',
  ban: 'Exclusão da conta',
};

// The e-mail's own word for each measure (the "Medida" line of the preview).
const MAIL_MEASURE_LABEL: Readonly<Record<SanctionKind, string>> = {
  warning: 'Aviso',
  content_removal: 'Remoção de conteúdo',
  suspension: 'Suspensão temporária',
  ban: 'Exclusão da conta',
};

const DATE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Example: `ruleLabel('spam') // 'Spam e divulgação (§9)'` */
export function ruleLabel(rule: SanctionRule): string {
  const { title, section } = SANCTION_RULE_SECTIONS[rule];
  return `${title} (§${section})`;
}

/** Example: `ruleOptionLabel('harassment') // '§2 Respeito às pessoas'` */
export function ruleOptionLabel(rule: SanctionRule): string {
  const { title, section } = SANCTION_RULE_SECTIONS[rule];
  return `§${section} ${title}`;
}

/** Example: `dateLabel('2026-11-19T15:00:00.000Z') // '19/11/2026'` */
export function dateLabel(iso: string): string {
  return DATE.format(new Date(iso));
}

/** The end of a suspension in the admin's clock. Example: `untilLabel(iso) // 'até 21/10/2026 às 18:00'` */
export function untilLabel(until: Date): string {
  return `até ${DATE_TIME.format(until).replace(', ', ' às ')}`;
}

export type MeasurePreview = Readonly<{
  kind: SanctionKind;
  rule: SanctionRule;
  statement: string;
  until: Date | null;
}>;

/** The facts the e-mail carries, line by line, as the preview of the dialog shows them.
 *
 *  Example: `previewLines({ kind: 'warning', rule: 'spam', statement: 'x', until: null })[0] // 'Medida: Aviso'` */
export function previewLines(measure: MeasurePreview): string[] {
  const { title, section } = SANCTION_RULE_SECTIONS[measure.rule];
  const lines = [
    `Medida: ${MAIL_MEASURE_LABEL[measure.kind]}`,
    `Regra: ${title} (§${section} da Política de uso)`,
  ];
  if (measure.kind === 'suspension') {
    lines.push(`Prazo: ${measure.until ? untilLabel(measure.until) : 'sem prazo'}`);
  }
  lines.push(`O motivo: ${measure.statement.trim()}`);
  return lines;
}

/** The notice the users page shows once the measure is in the list.
 *
 *  Example: `measureNotice('warning', 'bia') // '@bia recebeu um aviso.'` */
export function measureNotice(kind: SanctionKind, username: string): string {
  if (kind === 'warning') return `@${username} recebeu um aviso.`;
  if (kind === 'content_removal') return `A remoção de conteúdo de @${username} foi registrada.`;
  return `O acesso de @${username} foi suspenso.`;
}

/** The notice of a ban: the account is suspended now and deleted on the date, unless appealed.
 *
 *  Example: `banNotice('bia', '2026-12-05T12:00:00.000Z') // 'O acesso de @bia foi suspenso e a conta será excluída em 05/12/2026.'` */
export function banNotice(username: string, deletionDueAt: string): string {
  return `O acesso de @${username} foi suspenso e a conta será excluída em ${dateLabel(deletionDueAt)}.`;
}

/** What a ban does, in the deletion dialog: the minimum age keeps no e-mail out and is refunded.
 *
 *  Example: `banConsequence('spam').startsWith('A exclusão é uma medida') // true` */
export function banConsequence(rule: SanctionRule): string {
  if (rule === 'minimum_age')
    return 'Exclusão por idade: a conta é suspensa agora e excluída em 15 dias, se a pessoa não provar pela contestação que tem 18 anos ou mais. O e-mail dela não é bloqueado. Se houver plano pago, reembolse o valor integral em Cobrança.';
  return 'A exclusão é uma medida por violar a Política de uso: a conta é suspensa agora e excluída em 15 dias, se a pessoa não contestar. Ela recebe o e-mail com o motivo e a data, e o e-mail dela não pode criar outra conta por 5 anos.';
}

/** Where a ban's deletion stands. Example: `deletionLabel(null) // 'Exclusão cancelada'` */
export function deletionLabel(deletionDueAt: string | null): string {
  return deletionDueAt ? `Exclusão em ${dateLabel(deletionDueAt)}` : 'Exclusão cancelada';
}

/** Where an appeal stands, in one line. Example: `appealLabel(null) // 'Sem contestação'` */
export function appealLabel(appeal: AccountSanctionDto['appeal']): string {
  if (appeal === null) return 'Sem contestação';
  if (appeal.outcome === null) return `Contestação recebida em ${dateLabel(appeal.receivedAt)}`;
  const outcome = appeal.outcome === 'reverted' ? 'revertida' : 'mantida';
  const by = appeal.decidedBy ? ` por @${appeal.decidedBy}` : '';
  const at = appeal.decidedAt ? ` em ${dateLabel(appeal.decidedAt)}` : '';
  return `Contestação ${outcome}${at}${by}`;
}
