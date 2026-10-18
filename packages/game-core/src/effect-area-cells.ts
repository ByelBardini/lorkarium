import type { AimedArea, EffectArea } from './effect-area.vo';
import { isSmoothArea } from './effect-area.vo';
import { facingVector, type Vector2 } from './facing';
import type { SceneSize } from './grid';

/** A whole cell of the grid, by column and row from the top-left. */
export type GridCell = Readonly<{ col: number; row: number }>;
/** A box in fractional cells. */
export type AreaBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

// Float slack so a cell center that sits exactly on the edge counts (the edge is inclusive).
const EDGE_SLACK = 1e-9;
const CONE_HALF_ANGLE = Math.PI / 4;
const LINE_HALF_WIDTH = 0.5;

/** The cells a grid shape paints: those whose center falls inside the shape, edge included,
 *  clipped to the scene, in reading order (row, then column). A smooth shape paints none.
 *
 *  Example: `effectAreaCells(scene, effectArea({ kind: 'circle', x: 5, y: 5, reach: 1, color: 'ember' }))` → the 4 cells of col 4–5 × row 4–5 */
export function effectAreaCells(scene: SceneSize, area: EffectArea): GridCell[] {
  if (isSmoothArea(area)) return [];
  const reach = reachBoxOf(area);
  const cols = clipped(rangeOf(reach.x, reach.width), scene.widthCells);
  const rows = clipped(rangeOf(reach.y, reach.height), scene.heightCells);
  return cellsWithin(area, cols, rows);
}

/** Whether a point in fractional cells lies inside the shape, edge included.
 *
 *  Example: `effectAreaContains(smoothCircleAt(5, 5, 2), { x: 6.9, y: 5 })` → `true` */
export function effectAreaContains(area: EffectArea, point: Vector2): boolean {
  const dx = point.x - area.x;
  const dy = point.y - area.y;
  if (area.kind === 'square') return insideBox(area, point);
  if (!('facing' in area)) return distanceFromAreaOrigin(area, point) <= area.reach + EDGE_SLACK;
  return insideAimed(area, dx, dy);
}

/** The smallest box that holds the shape, before clipping to the scene: the painted cells of a
 *  grid shape (a cone is only its wedge, not the circle of its reach), the outline of a smooth
 *  one (a semicircle only its half). It is where the selection and the handles are drawn.
 *
 *  Example: `effectAreaBounds(circleAt(5, 5, 2))` → `{ x: 3, y: 3, width: 4, height: 4 }` */
export function effectAreaBounds(area: EffectArea): AreaBounds {
  if (area.kind === 'square' || area.kind === 'emanation') return reachBoxOf(area);
  if (area.kind === 'smooth_semicircle') {
    return sectorBox(area, area.reach, area.facing - 90, area.facing + 90);
  }
  if (area.kind === 'smooth_circle') return reachBoxOf(area);
  const reach = reachBoxOf(area);
  const cells = cellsWithin(area, rangeOf(reach.x, reach.width), rangeOf(reach.y, reach.height));
  return cells.length > 0 ? boxOfCells(cells) : reach;
}

// Every point the shape may reach: the circle of its reach (the line widened by half a cell).
function reachBoxOf(area: EffectArea): AreaBounds {
  if (area.kind === 'square') {
    return { x: area.x, y: area.y, width: area.width, height: area.height };
  }
  if (area.kind === 'emanation') return grown(area, area.reach);
  const reach = area.kind === 'line' ? area.reach + LINE_HALF_WIDTH : area.reach;
  return { x: area.x - reach, y: area.y - reach, width: reach * 2, height: reach * 2 };
}

type CellRange = Readonly<{ first: number; last: number }>;

function cellsWithin(area: EffectArea, cols: CellRange, rows: CellRange): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = rows.first; row <= rows.last; row += 1) {
    for (let col = cols.first; col <= cols.last; col += 1) {
      if (effectAreaContains(area, { x: col + 0.5, y: row + 0.5 })) cells.push({ col, row });
    }
  }
  return cells;
}

function boxOfCells(cells: readonly GridCell[]): AreaBounds {
  const cols = cells.map(({ col }) => col);
  const rows = cells.map(({ row }) => row);
  const x = Math.min(...cols);
  const y = Math.min(...rows);
  return { x, y, width: Math.max(...cols) + 1 - x, height: Math.max(...rows) + 1 - y };
}

// The box of a circle sector: its center, both ends of the arc, and each quarter point inside it.
function sectorBox(center: Vector2, reach: number, from: number, to: number): AreaBounds {
  const at = (degrees: number): Vector2 => {
    const radians = (degrees * Math.PI) / 180;
    return { x: center.x + Math.cos(radians) * reach, y: center.y + Math.sin(radians) * reach };
  };
  const quarters = [-360, -270, -180, -90, 0, 90, 180, 270, 360].filter((a) => a > from && a < to);
  const points = [center, at(from), at(to), ...quarters.map(at)];
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  const width = Math.max(...points.map((point) => point.x)) - x;
  const height = Math.max(...points.map((point) => point.y)) - y;
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

// Floating point off cos/sin: a half-circle edge must land on its exact hundredth.
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function insideAimed(area: AimedArea, dx: number, dy: number): boolean {
  const toward = facingVector(area.facing);
  const along = dx * toward.x + dy * toward.y;
  const across = Math.abs(dx * toward.y - dy * toward.x);
  if (area.kind === 'line') {
    return (
      along > EDGE_SLACK &&
      along <= area.reach + EDGE_SLACK &&
      across <= LINE_HALF_WIDTH + EDGE_SLACK
    );
  }
  if (Math.hypot(dx, dy) > area.reach + EDGE_SLACK || along < -EDGE_SLACK) return false;
  if (area.kind === 'semicircle' || area.kind === 'smooth_semicircle') return true;
  return across <= along * Math.tan(CONE_HALF_ANGLE) + EDGE_SLACK;
}

function insideBox(box: AreaBounds, point: Vector2): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

/** How far a point is from where the shape is measured: its origin, or the nearest edge of an
 *  emanation's footprint (0 inside it).
 *
 *  Example: `distanceFromAreaOrigin(auraAround(5, 5, 1, 1), { x: 8, y: 5.5 })` → `2` */
export function distanceFromAreaOrigin(area: EffectArea, point: Vector2): number {
  if (area.kind !== 'emanation') return Math.hypot(point.x - area.x, point.y - area.y);
  const dx = Math.max(area.x - point.x, 0, point.x - (area.x + area.width));
  const dy = Math.max(area.y - point.y, 0, point.y - (area.y + area.height));
  return Math.hypot(dx, dy);
}

function grown(box: AreaBounds, by: number): AreaBounds {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

function rangeOf(start: number, length: number): CellRange {
  return { first: Math.floor(start), last: Math.ceil(start + length) - 1 };
}

function clipped(range: CellRange, sceneLength: number): CellRange {
  return { first: Math.max(0, range.first), last: Math.min(sceneLength - 1, range.last) };
}
