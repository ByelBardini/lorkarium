/**
 * The filled share of a hit point bar, as the `width` of an SVG rect in a 100-wide viewBox: the
 * CSP refuses inline styles, so the bar grows by attribute (docs/context/site.md, Armadilhas).
 * Example: `hpFillOf(41, 68) // '60.3'`
 */
export function hpFillOf(hp: number, maxHp: number): string {
  if (!(maxHp > 0)) {
    throw new Error(`maxHp must be a positive number of hit points, got ${maxHp}`);
  }
  const share = Math.min(Math.max(hp / maxHp, 0), 1);
  return (share * 100).toFixed(1);
}
