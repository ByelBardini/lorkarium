import type { UserReportDto } from '@lorkarium/contracts';

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
