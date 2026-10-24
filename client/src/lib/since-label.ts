const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type Step = Readonly<{ below: number; unitMs: number; one: string; many: string }>;

// Each step covers elapsed times below `below` (in ms), counted in its own unit.
const STEPS: readonly Step[] = [
  { below: HOUR_MS, unitMs: MINUTE_MS, one: 'min', many: 'min' },
  { below: DAY_MS, unitMs: HOUR_MS, one: 'h', many: 'h' },
  { below: 30 * DAY_MS, unitMs: DAY_MS, one: 'dia', many: 'dias' },
  { below: 365 * DAY_MS, unitMs: 30 * DAY_MS, one: 'mês', many: 'meses' },
  { below: Infinity, unitMs: 365 * DAY_MS, one: 'ano', many: 'anos' },
];

/** How long ago an instant was, rounded down to the largest unit ("há 2 dias"); under a minute,
 *  or an instant ahead of `now` (clocks apart), is "agora". The base of "ativo há" and "Trocada há".
 *
 *  Example: `sinceLabel('2026-10-12T20:00:00.000Z', new Date('2026-10-14T20:00:00.000Z')) // 'há 2 dias'` */
export function sinceLabel(instant: string, now: Date): string {
  const elapsed = now.getTime() - Date.parse(instant);
  if (!(elapsed >= MINUTE_MS)) return 'agora';
  // The last step has no ceiling, so a step is always found.
  const step = STEPS.find((candidate) => elapsed < candidate.below);
  if (!step) return 'agora';
  const count = Math.floor(elapsed / step.unitMs);
  return `há ${count} ${count === 1 ? step.one : step.many}`;
}
