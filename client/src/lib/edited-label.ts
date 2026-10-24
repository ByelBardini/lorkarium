const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar days between two instants in local time; a future edit counts as today.
function daysBetween(earlier: Date, later: Date): number {
  const start = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const end = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function countLabel(count: number, one: string, many: string): string {
  return `há ${count} ${count === 1 ? one : many}`;
}

/** When a grid was last changed, as the library card says it, in local calendar days.
 *
 *  Example: `editedLabel('2026-10-12T10:00:00.000Z', new Date(2026, 9, 14)) // 'editado há 2 dias'` */
export function editedLabel(updatedAt: string, now: Date): string {
  const days = daysBetween(new Date(updatedAt), now);
  if (days === 0) return 'editado hoje';
  if (days === 1) return 'editado ontem';
  if (days < 7) return `editado ${countLabel(days, 'dia', 'dias')}`;
  if (days < 30) return `editado ${countLabel(Math.floor(days / 7), 'semana', 'semanas')}`;
  if (days < 365) return `editado ${countLabel(Math.floor(days / 30), 'mês', 'meses')}`;
  return `editado ${countLabel(Math.floor(days / 365), 'ano', 'anos')}`;
}
