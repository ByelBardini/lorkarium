import type { BarFill } from '@/lib/bar-display';

export type BarTone = 'track' | 'fill' | 'negative' | 'over' | 'temp';

/** One rounded piece of the bar under a token, in px from the bar's left edge. */
export type BarSegment = Readonly<{ tone: BarTone; left: number; width: number }>;

/** The pieces of the bar under a token, back to front: the track, the fill, and past either end
 *  a second bar growing from the left (below zero on the empty track, above the maximum on top
 *  of the full fill), and the temp in front of everything.
 *
 *  Example: `barSegments({ fraction: 1, state: 'over', excess: 0.4, temp: 0 }, 100) // track, fill, over 40` */
export function barSegments(bar: BarFill, width: number): BarSegment[] {
  const segments: BarSegment[] = [{ tone: 'track', left: 0, width }];
  if (bar.fraction > 0) segments.push({ tone: 'fill', left: 0, width: width * bar.fraction });
  if (bar.state !== 'normal' && bar.excess > 0) {
    segments.push({ tone: bar.state, left: 0, width: width * bar.excess });
  }
  if (bar.temp > 0) segments.push({ tone: 'temp', left: 0, width: width * bar.temp });
  return segments;
}
