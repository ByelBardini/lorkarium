// From 0 (down the screen, the south of a top-down map) clockwise in 45° steps.
const WINDS = ['sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste', 'leste', 'sudeste'];
const STEP = 45;

/** Where a token looks, as the eight winds of the map (down the screen is south).
 *
 *  Example: `facingLabel(23) // 'sudoeste'` */
export function facingLabel(facing: number): string {
  const sector = Math.round(facing / STEP) % WINDS.length;
  return WINDS[sector] ?? 'sul';
}
