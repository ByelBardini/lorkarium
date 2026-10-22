/** One dash of a ring: from `start` to `end` radians (0 = right, clockwise on screen). */
export type RingArc = Readonly<{ start: number; end: number }>;

/** The dashes of a dashed ring (PixiJS 8 has no dashed stroke): about `dash` px drawn and `gap`
 *  px left, stretched a little so they close the turn evenly.
 *
 *  Example: `for (const { start, end } of dashedRingArcs(r, 4, 3)) g.arc(0, 0, r, start, end)` */
export function dashedRingArcs(radius: number, dash: number, gap: number): RingArc[] {
  if (radius <= 0 || dash <= 0) return [];
  const count = Math.max(1, Math.round((2 * Math.PI * radius) / (dash + gap)));
  const period = (2 * Math.PI) / count;
  const drawn = period * (dash / (dash + gap));
  return Array.from({ length: count }, (_, index) => ({
    start: index * period,
    end: index * period + drawn,
  }));
}
