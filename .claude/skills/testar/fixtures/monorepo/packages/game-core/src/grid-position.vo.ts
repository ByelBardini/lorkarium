export type GridPosition = Readonly<{ column: number; row: number }>;

/** A cell of the square grid; refuses negative or fractional coordinates.
 *
 *  Example: `gridPosition(2, 3) // { column: 2, row: 3 }` */
export function gridPosition(column: number, row: number): GridPosition {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0) {
    throw new RangeError(`grid position must be non-negative integers, got (${column}, ${row})`);
  }
  return { column, row };
}
