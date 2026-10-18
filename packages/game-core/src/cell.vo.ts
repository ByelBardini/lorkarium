/** A position on the scene grid: column and row from the top-left corner, in steps of half a cell
 *  and ≥ 0 (a half-cell token stands at 1.5). */
export type Cell = Readonly<{ col: number; row: number }>;

/** Builds a cell, refusing a coordinate that is not a multiple of 0.5 ≥ 0.
 *
 *  Example: `cell(3, 4)` → `{ col: 3, row: 4 }` */
export function cell(col: number, row: number): Cell {
  assertCellCoordinate('col', col);
  assertCellCoordinate('row', row);
  return Object.freeze({ col, row });
}

/** Cells are values: same column and row means the same cell.
 *
 *  Example: `sameCell(cell(1, 2), cell(1, 2))` → `true` */
export function sameCell(left: Cell, right: Cell): boolean {
  return left.col === right.col && left.row === right.row;
}

function assertCellCoordinate(axis: 'col' | 'row', value: number): void {
  if (Number.isInteger(value * 2) && value >= 0) return;
  throw new RangeError(`Cell ${axis} ${String(value)} is invalid: expected a multiple of 0.5 ≥ 0.`);
}
