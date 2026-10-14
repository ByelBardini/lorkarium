/** Keeps a number inside a closed range.
 *
 *  Example: `clampValue(12, 0, 10) // 10` */
export function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
