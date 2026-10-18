/** The smallest token side, in cells. */
export const TOKEN_SIZE_MIN = 0.5;
/** The largest token side, in cells. */
export const TOKEN_SIZE_MAX = 10;

/** How much of the grid a token covers: width and height in cells, each a multiple of 0.5 from
 *  0.5 to 10 (a 2 × 1 token is a horse, a 0.5 × 0.5 one a rat). */
export type TokenSize = Readonly<{ width: number; height: number }>;

/** Builds a token size, refusing a side off the half-cell steps or outside 0.5–10.
 *
 *  Example: `tokenSize(2, 1)` → `{ width: 2, height: 1 }` */
export function tokenSize(width: number, height: number): TokenSize {
  assertTokenSide('width', width);
  assertTokenSide('height', height);
  return Object.freeze({ width, height });
}

function assertTokenSide(axis: 'width' | 'height', value: number): void {
  if (Number.isInteger(value * 2) && value >= TOKEN_SIZE_MIN && value <= TOKEN_SIZE_MAX) return;
  throw new RangeError(
    `Token ${axis} ${String(value)} is invalid: expected a multiple of 0.5 from 0.5 to 10.`,
  );
}
