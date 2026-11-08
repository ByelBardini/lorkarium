/** How far this clock runs ahead of the server's, by one message: the time it arrived here
 *  (`receivedAtMs`, this wall clock) minus the server time stamped on it (`at`). The delivery delay
 *  is in it too, so the lowest one seen is the closest guess.
 *
 *  Example: `serverOffsetOf(event.at, Date.now())` → `120` */
export function serverOffsetOf(at: string, receivedAtMs: number): number {
  return receivedAtMs - Date.parse(at);
}

/** The offset to keep after seeing one more: the lowest (the fastest delivery) wins.
 *
 *  Example: `lowerOffsetOf(120, 80)` → `80`; `lowerOffsetOf(null, 120)` → `120` */
export function lowerOffsetOf(kept: number | null, seen: number): number {
  return kept === null ? seen : Math.min(kept, seen);
}

/** The server's clock now, guessed from this wall clock and the offset kept.
 *
 *  Example: `serverNowOf(80, Date.now())` */
export function serverNowOf(offsetMs: number, wallNowMs: number): number {
  return wallNowMs - offsetMs;
}
