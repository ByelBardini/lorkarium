const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;

/** How long a member has been away, counted on the server's clock: from `awaySince` to the
 *  `serverAt` of the update that told it, plus what passed in this browser since. The browser's
 *  own clock may be set apart from the server's, so the two are never compared directly; a
 *  negative count (the clocks apart anyway) reads "ausente agora".
 *
 *  Example: `awayLabelOf('2026-10-22T12:00:00Z', '2026-10-22T12:04:00Z', 0) // 'ausente há 4 min'` */
export function awayLabelOf(awaySince: string, serverAt: string, elapsedMs: number): string {
  const awayMs = Date.parse(serverAt) - Date.parse(awaySince) + elapsedMs;
  const minutes = Math.floor(awayMs / MINUTE_MS);
  if (minutes < 1) return 'ausente agora';
  if (minutes < HOUR_MINUTES) return `ausente há ${minutes} min`;
  return `ausente há ${Math.floor(minutes / HOUR_MINUTES)} h`;
}
