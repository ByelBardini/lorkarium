/** A length or coordinate in cells rounded to the hundredth, as a `numeric(…, 2)` column keeps it.
 *
 *  Example: `cellsHundredth(7.125)` → `7.13` */
export function cellsHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A length or coordinate in cells as the string a `numeric(…, 2)` column is written with.
 *
 *  Example: `cellsNumeric(10 / 3)` → `'3.33'` */
export function cellsNumeric(value: number): string {
  return cellsHundredth(value).toFixed(2);
}
