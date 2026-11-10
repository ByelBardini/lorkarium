/** The finest step of a position, in cells: one world pixel at 100% (`CELL_WORLD_SIZE` = 64). A
 *  binary fraction, so a stored coordinate times 64 is a whole number with no rounding error. */
export const POSITION_STEP = 1 / 64;

/** A position on the scene grid: column and row from the top-left corner, in steps of
 *  `POSITION_STEP` and ≥ 0 (a half-cell token stands at 1.5, a free one at 1.015625). */
export type Cell = Readonly<{ col: number; row: number }>;

/** Whether a coordinate is a position: a multiple of `POSITION_STEP` ≥ 0.
 *
 *  Example: `isPositionStep(1.015625)` → `true` */
export function isPositionStep(value: number): boolean {
  return Number.isInteger(value / POSITION_STEP) && value >= 0;
}

/** Builds a cell, refusing a coordinate that is not a multiple of 1/64 ≥ 0.
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
  if (isPositionStep(value)) return;
  throw new RangeError(
    `Cell ${axis} ${String(value)} is invalid: expected a multiple of 1/64 ≥ 0.`,
  );
}
