/** The widest aura, in cells past the token's edge (30 m on a 1.5 m grid): a shader aura costs
 *  per pixel, and no common aura goes past 30 ft. */
export const AURA_RADIUS_MAX = 20;
/** The faintest aura opacity, in percent: below it the aura is not seen on the board. */
export const AURA_OPACITY_MIN = 10;
export const AURA_OPACITY_MAX = 100;

/** How far an aura reaches past the token's edge, in cells, from 0 (only the footprint) to 20.
 *  Measured from the edge like an emanation (the ruler is `distanceToBox`, euclidean).
 *
 *  Example: `auraRadius(2)` → `2`; `auraRadius(21)` throws a `RangeError` citing 21 */
export function auraRadius(radius: number): number {
  if (Number.isFinite(radius) && radius >= 0 && radius <= AURA_RADIUS_MAX) return radius;
  throw new RangeError(
    `Aura radius ${String(radius)} is invalid: expected 0 to ${AURA_RADIUS_MAX} cells.`,
  );
}

/** How opaque an aura is drawn, as a whole percent from 10 to 100.
 *
 *  Example: `auraOpacity(50)` → `50`; `auraOpacity(50.5)` throws a `RangeError` citing 50.5 */
export function auraOpacity(percent: number): number {
  const whole = Number.isInteger(percent);
  if (whole && percent >= AURA_OPACITY_MIN && percent <= AURA_OPACITY_MAX) return percent;
  throw new RangeError(
    `Aura opacity ${String(percent)} is invalid: expected a whole percent from ${AURA_OPACITY_MIN} to ${AURA_OPACITY_MAX}.`,
  );
}
