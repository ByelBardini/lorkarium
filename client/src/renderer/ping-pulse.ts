/** How long a ping stays on the board: two pulses of the ring. */
export const PING_DURATION_MS = 3000;

const PING_PULSE_MS = 1500;
// With reduced motion the ring stands still at this share of its full radius and only fades.
const STILL_RADIUS = 0.6;

/** The ring at one instant: `radius` as a share of its full radius (0–1), `alpha` 0–1. */
export type PingPulse = Readonly<{ radius: number; alpha: number }>;

/** The ring `elapsedMs` after the ping, or `null` once it is over. Each pulse grows from the
 *  center and fades as it grows.
 *
 *  Example: `pingPulseAt(750, false) // { radius: 0.5, alpha: 0.5 }` */
export function pingPulseAt(elapsedMs: number, reducedMotion: boolean): PingPulse | null {
  if (elapsedMs >= PING_DURATION_MS) return null;
  if (reducedMotion) return { radius: STILL_RADIUS, alpha: 1 - elapsedMs / PING_DURATION_MS };
  const phase = (elapsedMs % PING_PULSE_MS) / PING_PULSE_MS;
  return { radius: phase, alpha: 1 - phase };
}
