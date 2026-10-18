// From 0 (right on the screen, the east of a top-down map) clockwise in 45° steps.
const WINDS = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];
const STEP = 45;

/** Where a token looks, as the eight winds of the map (down the screen is south).
 *
 *  Example: `facingLabel(23) // 'sudeste'` */
export function facingLabel(facing: number): string {
  const sector = Math.round(facing / STEP) % WINDS.length;
  return WINDS[sector] ?? 'leste';
}
