import type { UserReportDto } from '@lorkarium/contracts';
import type { SanctionDraft } from './sanction-dialog';

/** The measure "Aplicar medida" opens with for a report: tied to it, and a report of someone
 *  under 18 starts as the age removal (Termos §3, ECA Digital).
 *
 *  Example: `reportMeasureDraft(report).rule // 'minimum_age' when the reason is 'underage'` */
export function reportMeasureDraft(report: Pick<UserReportDto, 'id' | 'reason'>): SanctionDraft {
  if (report.reason === 'underage')
    return { kind: 'ban', rule: 'minimum_age', reportId: report.id };
  return { reportId: report.id };
}

/** One side of a report as the queue writes it: the @ of the time, and "(excluído)" once the
 *  account is gone (its card cannot open any more).
 *
 *  Example: `reportPartyLabel({ id: null, username: 'caio' }) // '@caio (excluído)'` */
export function reportPartyLabel(party: UserReportDto['reporter']): string {
  return party.id === null ? `@${party.username} (excluído)` : `@${party.username}`;
}

/** Example: `reportShotsLabel(3) // '3 prints'` */
export function reportShotsLabel(count: number): string {
  if (count === 0) return 'Sem prints';
  return count === 1 ? '1 print' : `${count} prints`;
}
