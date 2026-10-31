/** The hero scene's grid cell, in `viewBox` units (1600 × 1000, so 25 × 15.6 cells). */
export const CELL_PX = 64;

export interface ScenePlacement {
  col: number;
  row: number;
  /** Cells per side: 1 for a medium creature, 2 for the ogre. */
  size: number;
}

export interface SceneToken extends ScenePlacement {
  label: string;
  side: 'party' | 'foe';
  /** Share of the hit point bar that is filled, 0 to 1. */
  hp: number;
}

/**
 * The centre of a token placed by its top-left cell, as the board snaps it: a one-cell token in
 * the middle of the cell, a 2×2 one on the crossing of its four cells.
 * Example: `sceneCenterOf({ col: 16, row: 10, size: 1 }) // { cx: 1056, cy: 672 }`
 */
export function sceneCenterOf({ col, row, size }: ScenePlacement): { cx: number; cy: number } {
  assertCellCount('col', col, 0);
  assertCellCount('row', row, 0);
  assertCellCount('size', size, 1);
  const half = (size * CELL_PX) / 2;
  return { cx: col * CELL_PX + half, cy: row * CELL_PX + half };
}

function assertCellCount(field: string, value: number, min: number): void {
  if (Number.isInteger(value) && value >= min) return;
  throw new Error(`Scene ${field} must be a non-negative integer ≥ ${min}, got ${value}`);
}
