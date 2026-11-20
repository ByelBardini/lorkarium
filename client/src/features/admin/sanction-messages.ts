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
  if (kind === 'suspension') return `O acesso de @${username} foi suspenso.`;
  return `A conta @${username} foi excluída.`;
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
