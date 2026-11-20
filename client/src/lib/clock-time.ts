const CLOCK_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * The hour and minute of a moment in the reader's clock, as the feeds and notices show it.
 * Example: formatClockTime('2026-11-19T17:30:00Z') // '14:30' in Brasília
 */
export function formatClockTime(at: Date | string): string {
  return CLOCK_TIME.format(typeof at === 'string' ? new Date(at) : at);
}
