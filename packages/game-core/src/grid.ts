import { cell, type Cell } from './cell.vo';
import type { TokenSize } from './token-size.vo';

/** Scene size in cells. */
export type SceneSize = Readonly<{ widthCells: number; heightCells: number }>;

/** Distance in cells where a diagonal step counts as one (the ruler's rule, spec §3.2).
 *
 *  Example: `cellDistance(cell(0, 0), cell(3, 2))` → `3` */
export function cellDistance(from: Cell, to: Cell): number {
  return Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
}

/** Distance in cells along a path with bends: the sum of each leg by `cellDistance` (the ruler
 *  of a dragged token, spec §3.2). A path of one cell or none is 0.
 *
 *  Example: `pathDistance([cell(0, 0), cell(3, 0), cell(3, 4)])` → `7` */
export function pathDistance(path: readonly Cell[]): number {
  return path.reduce((total, point, index) => {
    const previous = path[index - 1];
    return previous ? total + cellDistance(previous, point) : total;
  }, 0);
}

/** Every cell a path passes, one per cell counted by `pathDistance`, plus the start: each leg
 *  advances one cell per step on its longer axis and spreads the other axis's moves along the
 *  way, so a step is always one cell (diagonal included). A bend appears once.
 *
 *  Example: `pathCells([cell(0, 0), cell(3, 1)])` → `(0,0) (1,0) (2,1) (3,1)` */
export function pathCells(path: readonly Cell[]): Cell[] {
  const [start] = path;
  if (!start) return [];
  const trail = [start];
  path.forEach((point, index) => {
    const previous = path[index - 1];
    if (previous) trail.push(...legSteps(previous, point));
  });
  return trail;
}

function legSteps(from: Cell, to: Cell): Cell[] {
  const count = Math.ceil(cellDistance(from, to));
  return Array.from({ length: count }, (_, index) => {
    const share = (index + 1) / count;
    return cell(
      from.col + spreadMove(to.col - from.col, share),
      from.row + spreadMove(to.row - from.row, share),
    );
  });
}

// Whole moves round to whole cells and a half move to half cells, so every step lands on a cell.
function spreadMove(move: number, share: number): number {
  const unit = Number.isInteger(move) ? 1 : 0.5;
  return Math.sign(move) * Math.round((Math.abs(move) * share) / unit) * unit;
}

/** Whether a token of `size`, anchored at its top-left `origin`, stays inside the scene.
 *
 *  Example: `footprintFits({ widthCells: 20, heightCells: 12 }, cell(18, 10), tokenSize(2, 1))` → `true` */
export function footprintFits(scene: SceneSize, origin: Cell, size: TokenSize): boolean {
  return (
    origin.col + size.width <= scene.widthCells && origin.row + size.height <= scene.heightCells
  );
}
