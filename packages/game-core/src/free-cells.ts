import { cell, type Cell } from './cell.vo';
import { footprintFits, type SceneSize } from './grid';
import type { TokenBox } from './token-resize';
import type { TokenSize } from './token-size.vo';

type Offset = Readonly<{ dx: number; dy: number }>;

/** Where each footprint lands around `center` without covering an `occupied` box, another placed
 *  footprint or the scene edge: ring by ring (diagonal counts as one), the nearer cells of a ring
 *  first and then clockwise from the right, so the same input always gives the same cells. Each
 *  result is the footprint's top-left cell, in the order of `footprints`; `null` when any of them
 *  has no room (never a partial list). A center outside the scene is a `RangeError`.
 *
 *  Example: `freeCellsAround(cell(5, 5), [tokenSize(1, 1), tokenSize(1, 1)], [], { widthCells: 20, heightCells: 12 })` → `[(5, 5), (6, 5)]` */
export function freeCellsAround(
  center: Cell,
  footprints: readonly TokenSize[],
  occupied: readonly TokenBox[],
  scene: SceneSize,
): Cell[] | null {
  assertCenterInside(center, scene);
  const origins = originsAround(center, scene);
  const taken: TokenBox[] = [...occupied];
  const placed: Cell[] = [];
  for (const size of footprints) {
    const origin = origins.find((candidate) => isFree(candidate, size, taken, scene));
    if (!origin) return null;
    taken.push({ ...origin, width: size.width, height: size.height });
    placed.push(origin);
  }
  return placed;
}

function assertCenterInside(center: Cell, scene: SceneSize): void {
  if (center.col < scene.widthCells && center.row < scene.heightCells) return;
  throw new RangeError(
    `Center cell (${String(center.col)}, ${String(center.row)}) is outside the ` +
      `${String(scene.widthCells)} × ${String(scene.heightCells)} scene: ` +
      `expected col < ${String(scene.widthCells)} and row < ${String(scene.heightCells)}.`,
  );
}

function originsAround(center: Cell, scene: SceneSize): Cell[] {
  return offsetsInside(center, scene)
    .sort(compareOffsets)
    .map(({ dx, dy }) => cell(center.col + dx, center.row + dy));
}

/** Only offsets whose cell starts inside the scene: a 100 × 100 scene stays at 10 000 candidates. */
function offsetsInside(center: Cell, scene: SceneSize): Offset[] {
  const offsets: Offset[] = [];
  for (let dy = -Math.floor(center.row); center.row + dy < scene.heightCells; dy += 1) {
    for (let dx = -Math.floor(center.col); center.col + dx < scene.widthCells; dx += 1) {
      offsets.push({ dx, dy });
    }
  }
  return offsets;
}

function compareOffsets(left: Offset, right: Offset): number {
  const ring = Math.max(Math.abs(left.dx), Math.abs(left.dy));
  const otherRing = Math.max(Math.abs(right.dx), Math.abs(right.dy));
  if (ring !== otherRing) return ring - otherRing;
  const nearness = left.dx ** 2 + left.dy ** 2 - (right.dx ** 2 + right.dy ** 2);
  if (nearness !== 0) return nearness;
  return clockwiseFromRight(left) - clockwiseFromRight(right);
}

/** The y axis points down, so a growing angle turns clockwise on screen (as `Facing`). */
function clockwiseFromRight({ dx, dy }: Offset): number {
  const angle = Math.atan2(dy, dx);
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

function isFree(
  origin: Cell,
  size: TokenSize,
  taken: readonly TokenBox[],
  scene: SceneSize,
): boolean {
  if (!footprintFits(scene, origin, size)) return false;
  const footprint = { ...origin, width: size.width, height: size.height };
  return !taken.some((other) => boxesOverlap(footprint, other));
}

function boxesOverlap(left: TokenBox, right: TokenBox): boolean {
  return (
    left.col < right.col + right.width &&
    right.col < left.col + left.width &&
    left.row < right.row + right.height &&
    right.row < left.row + left.height
  );
}
