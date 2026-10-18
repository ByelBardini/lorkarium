/** A count of cells the Brazilian way: a half cell with a comma.
 *
 *  Example: `cellsText(1.5) // '1,5'` */
export function cellsText(cells: number): string {
  return String(cells).replace('.', ',');
}
