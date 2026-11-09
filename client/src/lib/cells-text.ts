/** A count of cells the Brazilian way: a half cell with a comma.
 *
 *  Example: `cellsText(1.5) // '1,5'` */
export function cellsText(cells: number): string {
  return String(cells).replace('.', ',');
}

/** A position to read aloud or on screen, to the hundredth: a free-movement token stands on steps
 *  of 1/64, and six decimals say nothing to a person.
 *
 *  Example: `positionText(4.015625) // '4,02'` */
export function positionText(position: number): string {
  return cellsText(Math.round(position * 100) / 100);
}
